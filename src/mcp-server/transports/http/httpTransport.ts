/**
 * @fileoverview Configures and starts the HTTP MCP transport using Hono.
 * This implementation uses the official @hono/mcp package for a fully
 * web-standard, platform-agnostic transport layer.
 *
 * Architecture: Each MCP session gets its own McpServer + StreamableHTTPTransport
 * pair. The StreamableHTTPTransport manages session IDs, protocol version
 * validation, and SSE streams internally. A per-session server map ensures
 * Protocol instances are never shared across connections.
 *
 * Implements MCP Specification 2025-06-18 Streamable HTTP Transport.
 * @see {@link https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http | MCP Streamable HTTP Transport}
 * @module src/mcp-server/transports/http/httpTransport
 */
import { StreamableHTTPTransport } from '@hono/mcp';
import { type ServerType, serve } from '@hono/node-server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import http from 'http';
import { randomUUID } from 'node:crypto';

import { config } from '@/config/index.js';
import {
  authContext,
  createAuthMiddleware,
  createAuthStrategy,
} from '@/mcp-server/transports/auth/index.js';
import { httpErrorHandler } from '@/mcp-server/transports/http/httpErrorHandler.js';
import { SessionManager } from '@/mcp-server/transports/http/sessionManager.js';
import type { HonoNodeBindings } from '@/mcp-server/transports/http/httpTypes.js';
import {
  type RequestContext,
  logger,
  logStartupBanner,
} from '@/utils/index.js';

/** Factory function that creates a fully-configured McpServer instance. */
export type McpServerFactory = () => Promise<McpServer>;

export function createHttpApp(
  createMcpServer: McpServerFactory,
  parentContext: RequestContext,
): Hono<{ Bindings: HonoNodeBindings }> {
  const app = new Hono<{ Bindings: HonoNodeBindings }>();
  const transportContext = {
    ...parentContext,
    component: 'HttpTransportSetup',
  };

  // Per-session transport map. Each session gets its own McpServer + Transport pair
  // because Protocol maintains a 1:1 relationship with its transport.
  const transports = new Map<string, StreamableHTTPTransport>();

  // Initialize SessionManager with configurable timeout and transport cleanup
  const sessionManager = SessionManager.getInstance(
    config.mcpStatefulSessionStaleTimeoutMs,
  );
  sessionManager.onSessionExpired = (sessionId: string) => {
    const transport = transports.get(sessionId);
    if (transport) {
      transport.close().catch((err) => {
        logger.warning('Failed to close transport for expired session', {
          ...transportContext,
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      transports.delete(sessionId);
    }
  };
  logger.info('Session manager initialized', {
    ...transportContext,
    staleTimeoutMs: config.mcpStatefulSessionStaleTimeoutMs,
  });

  // CORS configuration
  const explicitOrigins = config.mcpAllowedOrigins;
  const allowedOrigin: string | string[] =
    explicitOrigins && explicitOrigins.length > 0 ? explicitOrigins : '*';

  if (allowedOrigin === '*' && config.environment === 'production') {
    logger.warning(
      'MCP_ALLOWED_ORIGINS is not configured. CORS will allow all origins. ' +
        'Set MCP_ALLOWED_ORIGINS to restrict cross-origin access in production.',
      transportContext,
    );
  }

  app.use(
    '*',
    cors({
      origin: allowedOrigin,
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'Mcp-Session-Id',
        'MCP-Protocol-Version',
      ],
      exposeHeaders: ['Mcp-Session-Id'],
      credentials: true,
    }),
  );

  // Centralized error handling
  app.onError(httpErrorHandler);

  // Health check — unprotected
  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  // RFC 9728 Protected Resource Metadata endpoint (MCP 2025-06-18)
  // Must be accessible without authentication for discovery
  app.get('/.well-known/oauth-protected-resource', (c) => {
    if (!config.oauthIssuerUrl) {
      return c.json(
        { error: 'OAuth not configured on this server' },
        { status: 404 },
      );
    }

    return c.json({
      resource: config.mcpServerResourceIdentifier || config.oauthAudience,
      authorization_servers: [config.oauthIssuerUrl],
      bearer_methods_supported: ['header'],
      resource_signing_alg_values_supported: ['RS256', 'ES256', 'PS256'],
      ...(config.oauthJwksUri && { jwks_uri: config.oauthJwksUri }),
    });
  });

  // Create auth strategy and middleware if auth is enabled
  const authStrategy = createAuthStrategy();
  if (authStrategy) {
    const authMiddleware = createAuthMiddleware(authStrategy);
    app.use(config.mcpHttpEndpointPath, authMiddleware);
    logger.info(
      'Authentication middleware enabled for MCP endpoint.',
      transportContext,
    );
  } else {
    logger.info(
      'Authentication is disabled; MCP endpoint is unprotected.',
      transportContext,
    );
  }

  // Helper: look up a transport for an existing session, returning a 404 JSON-RPC
  // error response if not found or expired.
  const getSessionTransport = (
    sessionId: string,
  ): StreamableHTTPTransport | Response => {
    if (!sessionManager.isSessionValid(sessionId)) {
      // Clean up stale transport if it exists
      const stale = transports.get(sessionId);
      if (stale) {
        stale.close().catch(() => {});
        transports.delete(sessionId);
      }
      return Response.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session expired or invalid. Please reinitialize.',
          },
          id: null,
        },
        { status: 404 },
      );
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      return Response.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found. Please reinitialize.',
          },
          id: null,
        },
        { status: 404 },
      );
    }
    sessionManager.touchSession(sessionId);
    return transport;
  };

  // GET /mcp — status page (no session) or SSE stream (with session)
  app.get(config.mcpHttpEndpointPath, async (c) => {
    const sessionId = c.req.header('mcp-session-id');

    // No session ID = server info / status page
    if (!sessionId) {
      return c.json({
        status: 'ok',
        server: {
          name: config.mcpServerName,
          version: config.mcpServerVersion,
          description: config.mcpServerDescription,
          transport: config.mcpTransportType,
          sessionMode: config.mcpSessionMode,
        },
      });
    }

    // With session ID = SSE stream request — delegate to transport
    const transportOrError = getSessionTransport(sessionId);
    if (transportOrError instanceof Response) return transportOrError;

    const response = await transportOrError.handleRequest(c);
    return response ?? c.body(null, 204);
  });

  // DELETE /mcp — session termination (MCP Spec 2025-06-18)
  app.delete(config.mcpHttpEndpointPath, async (c) => {
    const sessionId = c.req.header('mcp-session-id');

    if (!sessionId) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Mcp-Session-Id header required for DELETE',
          },
          id: null,
        },
        400,
      );
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found or already expired',
          },
          id: null,
        },
        404,
      );
    }

    // Delegate to transport's internal DELETE handling (closes streams)
    const response = await transport.handleRequest(c);

    // Clean up our maps
    transports.delete(sessionId);
    sessionManager.terminateSession(sessionId);

    logger.info('Session terminated via DELETE', {
      ...transportContext,
      sessionId,
    });

    return response ?? c.body(null, 204);
  });

  // POST /mcp — JSON-RPC over Streamable HTTP
  // Protocol version validation is handled by StreamableHTTPTransport internally
  // using the SDK's SUPPORTED_PROTOCOL_VERSIONS (includes 2025-11-25, 2025-06-18, etc.)
  app.post(config.mcpHttpEndpointPath, async (c) => {
    logger.debug('Handling MCP POST request.', {
      ...transportContext,
      path: c.req.path,
    });

    const sessionId = c.req.header('mcp-session-id');

    const handleRequest = async (): Promise<Response> => {
      // Existing session — delegate to stored transport
      if (sessionId) {
        const transportOrError = getSessionTransport(sessionId);
        if (transportOrError instanceof Response) return transportOrError;

        const response = await transportOrError.handleRequest(c);
        return response ?? c.body(null, 204);
      }

      // New session — create per-session McpServer + Transport pair.
      // Each Protocol instance supports exactly one transport connection.
      const server = await createMcpServer();
      const transport = new StreamableHTTPTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          transports.set(sid, transport);
          const store = authContext.getStore();
          sessionManager.createSession(
            sid,
            store?.authInfo.clientId,
            store?.authInfo.tenantId,
          );
          logger.debug('New MCP session initialized', {
            ...transportContext,
            sessionId: sid,
          });
        },
        onsessionclosed: (sid: string) => {
          transports.delete(sid);
          sessionManager.terminateSession(sid);
          logger.debug('MCP session closed via transport', {
            ...transportContext,
            sessionId: sid,
          });
        },
      });

      await server.connect(transport);
      const response = await transport.handleRequest(c);
      return response ?? c.body(null, 204);
    };

    try {
      // Preserve auth context through the async handler
      const store = authContext.getStore();
      if (store) {
        return await authContext.run(store, handleRequest);
      }
      return await handleRequest();
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  });

  logger.info('Hono application setup complete.', transportContext);
  return app;
}

async function isPortInUse(
  port: number,
  host: string,
  parentContext: RequestContext,
): Promise<boolean> {
  const context = { ...parentContext, operation: 'isPortInUse', port, host };
  logger.debug(`Checking if port ${port} is in use...`, context);
  return new Promise((resolve) => {
    const tempServer = http.createServer();
    tempServer
      .once('error', (err: NodeJS.ErrnoException) =>
        resolve(err.code === 'EADDRINUSE'),
      )
      .once('listening', () => tempServer.close(() => resolve(false)))
      .listen(port, host);
  });
}

function startHttpServerWithRetry(
  app: Hono<{ Bindings: HonoNodeBindings }>,
  initialPort: number,
  host: string,
  maxRetries: number,
  parentContext: RequestContext,
): Promise<ServerType> {
  const startContext = {
    ...parentContext,
    operation: 'startHttpServerWithRetry',
  };
  logger.info(
    `Attempting to start HTTP server on port ${initialPort} with ${maxRetries} retries.`,
    startContext,
  );

  return new Promise((resolve, reject) => {
    const tryBind = (port: number, attempt: number) => {
      if (attempt > maxRetries + 1) {
        const error = new Error(
          `Failed to bind to any port after ${maxRetries} retries.`,
        );
        logger.fatal(error.message, { ...startContext, port, attempt });
        return reject(error);
      }

      isPortInUse(port, host, { ...startContext, port, attempt })
        .then((inUse) => {
          if (inUse) {
            logger.warning(`Port ${port} is in use, retrying...`, {
              ...startContext,
              port,
              attempt,
            });
            setTimeout(
              () => tryBind(port + 1, attempt + 1),
              config.mcpHttpPortRetryDelayMs,
            );
            return;
          }

          try {
            const serverInstance = serve(
              { fetch: app.fetch, port, hostname: host },
              (info) => {
                const serverAddress = `http://${info.address}:${info.port}${config.mcpHttpEndpointPath}`;
                logger.info(`HTTP transport listening at ${serverAddress}`, {
                  ...startContext,
                  port,
                  address: serverAddress,
                });
                logStartupBanner(
                  `\n🚀 MCP Server running at: ${serverAddress}`,
                  'http',
                );
              },
            );
            resolve(serverInstance);
          } catch (err: unknown) {
            logger.warning(
              `Binding attempt failed for port ${port}, retrying...`,
              { ...startContext, port, attempt, error: String(err) },
            );
            setTimeout(
              () => tryBind(port + 1, attempt + 1),
              config.mcpHttpPortRetryDelayMs,
            );
          }
        })
        .catch((err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        );
    };

    tryBind(initialPort, 1);
  });
}

export async function startHttpTransport(
  createMcpServer: McpServerFactory,
  parentContext: RequestContext,
): Promise<ServerType> {
  const transportContext = {
    ...parentContext,
    component: 'HttpTransportStart',
  };
  logger.info('Starting HTTP transport.', transportContext);

  const app = createHttpApp(createMcpServer, transportContext);

  const server = await startHttpServerWithRetry(
    app,
    config.mcpHttpPort,
    config.mcpHttpHost,
    config.mcpHttpMaxPortRetries,
    transportContext,
  );

  logger.info('HTTP transport started successfully.', transportContext);
  return server;
}

export async function stopHttpTransport(
  server: ServerType,
  parentContext: RequestContext,
): Promise<void> {
  const operationContext = {
    ...parentContext,
    operation: 'stopHttpTransport',
    transportType: 'Http',
  };
  logger.info('Attempting to stop http transport...', operationContext);

  // Stop session cleanup interval
  const sessionManager = SessionManager.getInstance();
  sessionManager.stopCleanupInterval();
  logger.info('Session cleanup interval stopped', operationContext);

  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        logger.error('Error closing HTTP server.', err, operationContext);
        return reject(err);
      }
      logger.info('HTTP server closed successfully.', operationContext);
      resolve();
    });
  });
}
