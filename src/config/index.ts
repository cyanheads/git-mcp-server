/**
 * @fileoverview Loads, validates, and exports application configuration.
 * This module centralizes configuration management, sourcing values from
 * environment variables. It uses Zod for schema validation to ensure type safety
 * and correctness of configuration parameters, and is designed to be
 * environment-agnostic (e.g., Node.js, Cloudflare Workers).
 *
 * @module src/config/index
 */
import { homedir } from 'os';
import path from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

import packageJson from '../../package.json' with { type: 'json' };
import { JsonRpcErrorCode, McpError } from '../types-global/errors.js';

type PackageManifest = {
  name?: string;
  version?: string;
  description?: string;
};

const packageManifest = packageJson as PackageManifest;
const hasFileSystemAccess =
  typeof process !== 'undefined' &&
  typeof process.versions === 'object' &&
  process.versions !== null &&
  typeof process.versions.node === 'string';

// Suppress dotenv's noisy initial log message as suggested by its output.
dotenv.config({ quiet: true });

// --- Helper Functions ---
const emptyStringAsUndefined = (val: unknown) => {
  if (typeof val === 'string' && val.trim() === '') {
    return undefined;
  }
  return val;
};

/**
 * Expands tilde (~) in paths to the user's home directory.
 * Returns undefined for empty/undefined inputs.
 * Supports both ~/path (expands to homedir/path) and ~ alone (expands to homedir).
 *
 * @param path - Path that may contain tilde prefix
 * @returns Expanded absolute path or undefined
 *
 * @example
 * expandTildePath('~/Developer/') // '/Users/username/Developer/'
 * expandTildePath('~') // '/Users/username'
 * expandTildePath('/absolute/path') // '/absolute/path' (unchanged)
 * expandTildePath('') // undefined
 */
const expandTildePath = (path: unknown): string | undefined => {
  if (typeof path !== 'string' || path.trim() === '') {
    return undefined;
  }

  const trimmed = path.trim();

  // Expand ~/path to homedir/path
  if (trimmed.startsWith('~/')) {
    return `${homedir()}${trimmed.slice(1)}`;
  }

  // Expand ~ alone to homedir
  if (trimmed === '~') {
    return homedir();
  }

  // Return as-is (already absolute or relative)
  return trimmed;
};

/**
 * Cross-platform check for absolute paths.
 * Uses Node's path.isAbsolute which handles:
 * - POSIX: /home/user, /var/www
 * - Windows: C:\Users, D:\Projects, C:/Users
 * - UNC: \\server\share
 *
 * @param p - Path to check
 * @returns true if path is absolute on the current platform
 */
const isAbsolutePath = (p: string): boolean => {
  if (!p) return false;
  return path.isAbsolute(p);
};

// --- Schema Definition ---
const ConfigSchema = z.object({
  // Package information sourced from environment variables
  pkg: z.object({
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
  }),
  mcpServerName: z.string(), // Will be derived from pkg.name
  mcpServerVersion: z.string(), // Will be derived from pkg.version
  mcpServerDescription: z.string().optional(), // Will be derived from pkg.description
  logLevel: z
    .preprocess(
      (val) => {
        const str = emptyStringAsUndefined(val);
        if (typeof str === 'string') {
          const lower = str.toLowerCase();
          const aliasMap: Record<string, string> = {
            warning: 'warn',
            err: 'error',
            information: 'info',
          };
          return aliasMap[lower] ?? lower;
        }
        return str;
      },
      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
    )
    .default('debug'),
  logsPath: z.preprocess(expandTildePath, z.string().optional()), // Made optional as it's Node-specific
  environment: z
    .preprocess(
      (val) => {
        const str = emptyStringAsUndefined(val);
        if (typeof str === 'string') {
          const lower = str.toLowerCase();
          const aliasMap: Record<string, string> = {
            dev: 'development',
            prod: 'production',
            test: 'testing',
          };
          return aliasMap[lower] ?? lower;
        }
        return str;
      },
      z.enum(['development', 'production', 'testing']),
    )
    .default('development'),
  mcpTransportType: z.preprocess(
    emptyStringAsUndefined,
    z.enum(['stdio', 'http']).default('stdio'),
  ),
  mcpSessionMode: z.preprocess(
    emptyStringAsUndefined,
    z.enum(['stateless', 'stateful', 'auto']).default('auto'),
  ),
  mcpResponseFormat: z.preprocess(
    emptyStringAsUndefined,
    z.enum(['json', 'markdown', 'auto']).default('json'),
  ),
  mcpResponseVerbosity: z.preprocess(
    emptyStringAsUndefined,
    z.enum(['minimal', 'standard', 'full']).default('standard'),
  ),
  mcpHttpPort: z.coerce.number().default(3015),
  mcpHttpHost: z.string().default('127.0.0.1'),
  mcpHttpEndpointPath: z.string().default('/mcp'),
  mcpHttpMaxPortRetries: z.coerce.number().default(15),
  mcpHttpPortRetryDelayMs: z.coerce.number().default(50),
  mcpStatefulSessionStaleTimeoutMs: z.coerce.number().default(1_800_000),
  mcpAllowedOrigins: z.array(z.string()).optional(),
  mcpAuthSecretKey: z.string().optional(),
  mcpAuthMode: z.preprocess(
    emptyStringAsUndefined,
    z.enum(['jwt', 'oauth', 'none']).default('none'),
  ),
  oauthIssuerUrl: z.string().url().optional(),
  oauthJwksUri: z.string().url().optional(),
  oauthAudience: z.string().optional(),
  oauthJwksCooldownMs: z.coerce.number().default(300_000), // 5 minutes
  oauthJwksTimeoutMs: z.coerce.number().default(5_000), // 5 seconds
  mcpServerResourceIdentifier: z.string().url().optional(), // RFC 8707 resource indicator
  devMcpClientId: z.string().optional(),
  devMcpScopes: z.array(z.string()).optional(),
  openrouterAppUrl: z.string().default('http://localhost:3000'),
  openrouterAppName: z.string(),
  openrouterApiKey: z.string().optional(),
  llmDefaultModel: z.string().default('google/gemini-2.5-flash-preview-05-20'),
  llmDefaultTemperature: z.coerce.number().optional(),
  llmDefaultTopP: z.coerce.number().optional(),
  llmDefaultMaxTokens: z.coerce.number().optional(),
  llmDefaultTopK: z.coerce.number().optional(),
  llmDefaultMinP: z.coerce.number().optional(),
  oauthProxy: z
    .object({
      authorizationUrl: z.string().url().optional(),
      tokenUrl: z.string().url().optional(),
      revocationUrl: z.string().url().optional(),
      issuerUrl: z.string().url().optional(),
      serviceDocumentationUrl: z.string().url().optional(),
      defaultClientRedirectUris: z.array(z.string()).optional(),
    })
    .optional(),
  supabase: z
    .object({
      url: z.string().url(),
      anonKey: z.string(),
      serviceRoleKey: z.string().optional(),
    })
    .optional(),
  storage: z.object({
    providerType: z
      .preprocess(
        (val) => {
          const str = emptyStringAsUndefined(val);
          if (typeof str === 'string') {
            const lower = str.toLowerCase();
            const aliasMap: Record<string, string> = {
              mem: 'in-memory',
              fs: 'filesystem',
            };
            return aliasMap[lower] ?? lower;
          }
          return str;
        },
        z.enum([
          'in-memory',
          'filesystem',
          'supabase',
          'cloudflare-r2',
          'cloudflare-kv',
        ]),
      )
      .default('in-memory'),
    filesystemPath: z.preprocess(
      expandTildePath,
      z.string().default('./.storage'),
    ), // Supports tilde expansion for filesystem storage
  }),
  git: z.object({
    provider: z.preprocess(
      emptyStringAsUndefined,
      z.enum(['auto', 'cli', 'isomorphic']).default('auto'),
    ),
    signCommits: z.coerce.boolean().default(false),
    authorName: z.string().optional(),
    authorEmail: z.string().email().optional(),
    committerName: z.string().optional(),
    committerEmail: z.string().email().optional(),
    wrapupInstructionsPath: z.preprocess(
      expandTildePath,
      z.string().optional(),
    ), // Supports tilde expansion for custom wrapup instructions
    baseDir: z.preprocess(
      (val) => expandTildePath(emptyStringAsUndefined(val)),
      z
        .string()
        .refine((p) => !p || isAbsolutePath(p), {
          message:
            'GIT_BASE_DIR must be an absolute path (tilde expansion is supported)',
        })
        .optional(),
    ),
    maxCommandTimeoutMs: z.coerce.number().default(30000),
    maxBufferSizeMb: z.coerce.number().default(10),
  }),
  openTelemetry: z.object({
    enabled: z.coerce.boolean().default(false),
    serviceName: z.string(),
    serviceVersion: z.string(),
    tracesEndpoint: z.string().url().optional(),
    metricsEndpoint: z.string().url().optional(),
    samplingRatio: z.coerce.number().default(1.0),
    logLevel: z
      .preprocess(
        (val) => {
          const str = emptyStringAsUndefined(val);
          if (typeof str === 'string') {
            const lower = str.toLowerCase();
            const aliasMap: Record<string, string> = {
              err: 'ERROR',
              warning: 'WARN',
              information: 'INFO',
            };
            return aliasMap[lower] ?? str.toUpperCase();
          }
          return str;
        },
        z.enum(['NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE', 'ALL']),
      )
      .default('INFO'),
  }),
  speech: z
    .object({
      tts: z
        .object({
          enabled: z.coerce.boolean().default(false),
          provider: z.enum(['elevenlabs']).default('elevenlabs'),
          apiKey: z.string().optional(),
          baseUrl: z.string().url().optional(),
          defaultVoiceId: z.string().optional(),
          defaultModelId: z.string().optional(),
          timeout: z.coerce.number().optional(),
        })
        .optional(),
      stt: z
        .object({
          enabled: z.coerce.boolean().default(false),
          provider: z.enum(['openai-whisper']).default('openai-whisper'),
          apiKey: z.string().optional(),
          baseUrl: z.string().url().optional(),
          defaultModelId: z.string().optional(),
          timeout: z.coerce.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

// --- Parsing Logic ---
const parseConfig = () => {
  const env = process.env;

  const rawConfig = {
    pkg: {
      name: env.PACKAGE_NAME ?? packageManifest.name,
      version: env.PACKAGE_VERSION ?? packageManifest.version,
      description: env.PACKAGE_DESCRIPTION ?? packageManifest.description,
    },
    logLevel: env.MCP_LOG_LEVEL,
    logsPath: env.LOGS_DIR,
    environment: env.NODE_ENV,
    mcpTransportType: env.MCP_TRANSPORT_TYPE,
    mcpSessionMode: env.MCP_SESSION_MODE,
    mcpResponseFormat: env.MCP_RESPONSE_FORMAT,
    mcpResponseVerbosity: env.MCP_RESPONSE_VERBOSITY,
    mcpHttpPort: env.MCP_HTTP_PORT,
    mcpHttpHost: env.MCP_HTTP_HOST,
    mcpHttpEndpointPath: env.MCP_HTTP_ENDPOINT_PATH,
    mcpHttpMaxPortRetries: env.MCP_HTTP_MAX_PORT_RETRIES,
    mcpHttpPortRetryDelayMs: env.MCP_HTTP_PORT_RETRY_DELAY_MS,
    mcpStatefulSessionStaleTimeoutMs: env.MCP_STATEFUL_SESSION_STALE_TIMEOUT_MS,
    mcpAllowedOrigins: env.MCP_ALLOWED_ORIGINS?.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    mcpAuthSecretKey: env.MCP_AUTH_SECRET_KEY,
    mcpAuthMode: env.MCP_AUTH_MODE,
    oauthIssuerUrl: env.OAUTH_ISSUER_URL,
    oauthJwksUri: env.OAUTH_JWKS_URI,
    oauthAudience: env.OAUTH_AUDIENCE,
    oauthJwksCooldownMs: env.OAUTH_JWKS_COOLDOWN_MS,
    oauthJwksTimeoutMs: env.OAUTH_JWKS_TIMEOUT_MS,
    mcpServerResourceIdentifier: env.MCP_SERVER_RESOURCE_IDENTIFIER,
    devMcpClientId: env.DEV_MCP_CLIENT_ID,
    devMcpScopes: env.DEV_MCP_SCOPES?.split(',').map((s) => s.trim()),
    openrouterAppUrl: env.OPENROUTER_APP_URL,
    openrouterAppName: env.OPENROUTER_APP_NAME,
    openrouterApiKey: env.OPENROUTER_API_KEY,
    llmDefaultModel: env.LLM_DEFAULT_MODEL,
    llmDefaultTemperature: env.LLM_DEFAULT_TEMPERATURE,
    llmDefaultTopP: env.LLM_DEFAULT_TOP_P,
    llmDefaultMaxTokens: env.LLM_DEFAULT_MAX_TOKENS,
    llmDefaultTopK: env.LLM_DEFAULT_TOP_K,
    llmDefaultMinP: env.LLM_DEFAULT_MIN_P,
    oauthProxy:
      env.OAUTH_PROXY_AUTHORIZATION_URL || env.OAUTH_PROXY_TOKEN_URL
        ? {
            authorizationUrl: env.OAUTH_PROXY_AUTHORIZATION_URL,
            tokenUrl: env.OAUTH_PROXY_TOKEN_URL,
            revocationUrl: env.OAUTH_PROXY_REVOCATION_URL,
            issuerUrl: env.OAUTH_PROXY_ISSUER_URL,
            serviceDocumentationUrl: env.OAUTH_PROXY_SERVICE_DOCUMENTATION_URL,
            defaultClientRedirectUris:
              env.OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS?.split(',')
                .map((uri) => uri.trim())
                .filter(Boolean),
          }
        : undefined,
    supabase:
      env.SUPABASE_URL && env.SUPABASE_ANON_KEY
        ? {
            url: env.SUPABASE_URL,
            anonKey: env.SUPABASE_ANON_KEY,
            serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
          }
        : undefined,
    storage: {
      providerType: env.STORAGE_PROVIDER_TYPE,
      filesystemPath: env.STORAGE_FILESYSTEM_PATH,
    },
    git: {
      provider: env.GIT_PROVIDER,
      signCommits: env.GIT_SIGN_COMMITS,
      // Support multiple naming conventions for author/committer
      // Priority: GIT_AUTHOR_NAME > GIT_USERNAME > GIT_USER
      authorName:
        env.GIT_AUTHOR_NAME || env.GIT_USERNAME || env.GIT_USER || undefined,
      authorEmail:
        env.GIT_AUTHOR_EMAIL ||
        env.GIT_EMAIL ||
        env.GIT_USER_EMAIL ||
        undefined,
      committerName:
        env.GIT_COMMITTER_NAME || env.GIT_USERNAME || env.GIT_USER || undefined,
      committerEmail:
        env.GIT_COMMITTER_EMAIL ||
        env.GIT_EMAIL ||
        env.GIT_USER_EMAIL ||
        undefined,
      wrapupInstructionsPath: env.GIT_WRAPUP_INSTRUCTIONS_PATH,
      baseDir: env.GIT_BASE_DIR,
      maxCommandTimeoutMs: env.GIT_MAX_COMMAND_TIMEOUT_MS,
      maxBufferSizeMb: env.GIT_MAX_BUFFER_SIZE_MB,
    },
    openTelemetry: {
      enabled: env.OTEL_ENABLED,
      serviceName: env.OTEL_SERVICE_NAME,
      serviceVersion: env.OTEL_SERVICE_VERSION,
      tracesEndpoint: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      metricsEndpoint: env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
      samplingRatio: env.OTEL_TRACES_SAMPLER_ARG,
      logLevel: env.OTEL_LOG_LEVEL,
    },
    speech:
      env.SPEECH_TTS_ENABLED || env.SPEECH_STT_ENABLED
        ? {
            tts: env.SPEECH_TTS_ENABLED
              ? {
                  enabled: env.SPEECH_TTS_ENABLED,
                  provider: env.SPEECH_TTS_PROVIDER,
                  apiKey: env.SPEECH_TTS_API_KEY,
                  baseUrl: env.SPEECH_TTS_BASE_URL,
                  defaultVoiceId: env.SPEECH_TTS_DEFAULT_VOICE_ID,
                  defaultModelId: env.SPEECH_TTS_DEFAULT_MODEL_ID,
                  timeout: env.SPEECH_TTS_TIMEOUT,
                }
              : undefined,
            stt: env.SPEECH_STT_ENABLED
              ? {
                  enabled: env.SPEECH_STT_ENABLED,
                  provider: env.SPEECH_STT_PROVIDER,
                  apiKey: env.SPEECH_STT_API_KEY,
                  baseUrl: env.SPEECH_STT_BASE_URL,
                  defaultModelId: env.SPEECH_STT_DEFAULT_MODEL_ID,
                  timeout: env.SPEECH_STT_TIMEOUT,
                }
              : undefined,
          }
        : undefined,
    // The following fields will be derived and are not directly from env
    mcpServerName: env.MCP_SERVER_NAME,
    mcpServerVersion: env.MCP_SERVER_VERSION,
    mcpServerDescription: env.MCP_SERVER_DESCRIPTION,
  };

  // Use a temporary schema to parse package info and provide defaults
  const pkgSchema = z.object({
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
  });
  const parsedPkg = pkgSchema.parse(rawConfig.pkg);

  // Now add the derived values to the main rawConfig object to be parsed
  const finalRawConfig = {
    ...rawConfig,
    pkg: parsedPkg,
    logsPath: rawConfig.logsPath ?? (hasFileSystemAccess ? 'logs' : undefined),
    mcpServerName: env.MCP_SERVER_NAME ?? parsedPkg.name,
    mcpServerVersion: env.MCP_SERVER_VERSION ?? parsedPkg.version,
    mcpServerDescription: env.MCP_SERVER_DESCRIPTION ?? parsedPkg.description,
    openTelemetry: {
      ...rawConfig.openTelemetry,
      serviceName: env.OTEL_SERVICE_NAME ?? parsedPkg.name,
      serviceVersion: env.OTEL_SERVICE_VERSION ?? parsedPkg.version,
    },
    openrouterAppName: env.OPENROUTER_APP_NAME ?? parsedPkg.name,
  };

  const parsedConfig = ConfigSchema.safeParse(finalRawConfig);

  if (!parsedConfig.success) {
    // Keep existing TTY error logging for developer convenience.
    if (process.stdout.isTTY) {
      console.error(
        '❌ Invalid configuration found. Please check your environment variables.',
        parsedConfig.error.flatten().fieldErrors,
      );
    }
    // Throw a specific, typed error instead of exiting.
    throw new McpError(
      JsonRpcErrorCode.ConfigurationError,
      'Invalid application configuration.',
      {
        validationErrors: parsedConfig.error.flatten().fieldErrors,
      },
    );
  }

  return parsedConfig.data;
};

const config = parseConfig();

/**
 * Export the runtime configuration, parser, and schema, plus a static AppConfig type.
 */
export type AppConfig = z.infer<typeof ConfigSchema>;

export { config, ConfigSchema, parseConfig };
