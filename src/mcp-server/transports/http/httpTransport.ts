/**
 * @fileoverview Configures and starts the HTTP MCP transport using Hono.
 * This implementation uses the official @hono/mcp package for a fully
 * web-standard, platform-agnostic transport layer.
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

/**
 * Extends the base StreamableHTTPTransport to include a session ID.
 */
class McpSessionTransport extends StreamableHTTPTransport {
  public sessionId: string;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }
}

export function createHttpApp(
  mcpServer: McpServer,
  parentContext: RequestContext,
): Hono<{ Bindings: HonoNodeBindings }> {
  const app = new Hono<{ Bindings: HonoNodeBindings }>();
  const transportContext = {
    ...parentContext,
    component: 'HttpTransportSetup',
  };

  // Initialize SessionManager with configurable timeout
  const sessionManager = SessionManager.getInstance(
    config.mcpStatefulSessionStaleTimeoutMs,
  );
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

  // Health and GET /mcp status remain unprotected for convenience
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

  app.get(config.mcpHttpEndpointPath, (c) => {
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

  // DELETE endpoint for explicit session termination (MCP Spec 2025-06-18)
  // Per spec: Clients SHOULD send DELETE when leaving application
  // Server MAY respond 405 if it doesn't allow client-initiated termination
  app.delete(config.mcpHttpEndpointPath, (c) => {
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

    const terminated = sessionManager.terminateSession(sessionId);

    if (!terminated) {
      // Session not found - already expired or never existed
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001, // Server error
            message: 'Session not found or already expired',
          },
          id: null,
        },
        404,
      );
    }

    logger.info('Session terminated via DELETE', {
      ...transportContext,
      sessionId,
    });

    return c.body(null, 204); // Success, no content
  });

  // JSON-RPC over HTTP (Streamable)
  app.all(config.mcpHttpEndpointPath, async (c) => {
    const protocolVersion =
      c.req.header('mcp-protocol-version') ?? '2025-03-26';
    logger.debug('Handling MCP request.', {
      ...transportContext,
      path: c.req.path,
      method: c.req.method,
      protocolVersion,
    });

    // Per MCP Spec 2025-06-18: MCP-Protocol-Version header should be validated
    // We default to 2025-03-26 for backward compatibility if not provided
    const supportedVersions = ['2025-03-26', '2025-06-18'];
    if (!supportedVersions.includes(protocolVersion)) {
      logger.warning('Unsupported MCP protocol version requested.', {
        ...transportContext,
        protocolVersion,
        supportedVersions,
      });
      // Per MCP Spec: Server MUST respond with 400 Bad Request for unsupported versions
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32600, // Invalid Request
            message: `Unsupported MCP protocol version: ${protocolVersion}`,
            data: {
              requested: protocolVersion,
              supported: supportedVersions,
            },
          },
          id: null,
        },
        400,
      );
    }

    const sessionId = c.req.header('mcp-session-id') ?? randomUUID();

    // Per MCP Spec: Validate session exists and is not expired
    // If session ID provided but invalid, return 404 to trigger reinit
    if (
      c.req.header('mcp-session-id') &&
      !sessionManager.isSessionValid(sessionId)
    ) {
      logger.warning('Invalid or expired session ID', {
        ...transportContext,
        sessionId,
      });
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session expired or invalid. Please reinitialize.',
          },
          id: null,
        },
        404,
      );
    }

    // Create or update session
    if (!c.req.header('mcp-session-id')) {
      // New session - will be created on successful initialization
      logger.debug('New session will be created', {
        ...transportContext,
        sessionId,
      });
    } else {
      // Existing session - update activity timestamp
      sessionManager.touchSession(sessionId);
    }

    const transport = new McpSessionTransport(sessionId);

    const handleRpc = async (): Promise<Response> => {
      await mcpServer.connect(transport);
      const response = await transport.handleRequest(c);

      // Create session after successful initialization if it's a new session
      // We detect this by checking if session was just generated (no header provided)
      if (response && !c.req.header('mcp-session-id')) {
        // Get auth context if available
        const store = authContext.getStore();
        sessionManager.createSession(
          sessionId,
          store?.authInfo.clientId,
          store?.authInfo.tenantId,
        );
      }

      if (response) {
        return response;
      }
      return c.body(null, 204);
    };

    // The auth logic is now handled by the middleware. We just need to
    // run the core RPC logic within the async-local-storage context that
    // the middleware has already populated.
    try {
      const store = authContext.getStore();
      if (store) {
        return await authContext.run(store, handleRpc);
      }
      return await handleRpc();
    } catch (err) {
      // Only close transport on error - success path needs to keep it open
      await transport.close?.().catch((closeErr) => {
        logger.warning('Failed to close transport after error', {
          ...transportContext,
          sessionId,
          error:
            closeErr instanceof Error ? closeErr.message : String(closeErr),
        });
      });
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
  mcpServer: McpServer,
  parentContext: RequestContext,
): Promise<ServerType> {
  const transportContext = {
    ...parentContext,
    component: 'HttpTransportStart',
  };
  logger.info('Starting HTTP transport.', transportContext);

  const app = createHttpApp(mcpServer, transportContext);

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
