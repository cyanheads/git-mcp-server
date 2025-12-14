/**
 * @fileoverview Integration tests for the configuration service.
 * These tests validate that the config loader correctly processes environment
 * variables, applies defaults, and computes derived properties.
 * @module
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Store the original process.env
const originalEnv = { ...process.env };

describe('Configuration Service', () => {
  beforeEach(() => {
    // Reset process.env before each test to ensure isolation
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env after each test
    process.env = originalEnv;
  });

  it('should load default values when no environment variables are set', async () => {
    const { parseConfig } = await import('../../src/config/index.js');
    // Unset variables to ensure defaults are tested
    delete process.env.NODE_ENV;
    delete process.env.STORAGE_PROVIDER_TYPE;
    const config = parseConfig();
    expect(config.environment).toBe('development');
    expect(config.logLevel).toBe('debug');
    expect(config.mcpHttpPort).toBe(3015);
    expect(config.storage.providerType).toBe('in-memory');
  });

  it('should override default values with environment variables', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MCP_LOG_LEVEL = 'warn';
    process.env.MCP_HTTP_PORT = '8080';
    process.env.STORAGE_PROVIDER_TYPE = 'filesystem';

    const { parseConfig } = await import('../../src/config/index.js');
    const config = parseConfig();

    expect(config.environment).toBe('production');
    expect(config.logLevel).toBe('warn');
    expect(config.mcpHttpPort).toBe(8080);
    expect(config.storage.providerType).toBe('filesystem');
  });

  it('should correctly reflect the environment', async () => {
    const { parseConfig } = await import('../../src/config/index.js');

    process.env.NODE_ENV = 'development';
    const devConfig = parseConfig();
    expect(devConfig.environment).toBe('development');

    process.env.NODE_ENV = 'production';
    // Since we can't easily reset modules, we'll just re-run parseConfig
    const { parseConfig: prodParseConfig } =
      await import('../../src/config/index.js');
    const prodConfig = prodParseConfig();
    expect(prodConfig.environment).toBe('production');
  });

  describe('Configuration Aliasing', () => {
    it('should handle aliases for logLevel', async () => {
      process.env.MCP_LOG_LEVEL = 'warning';
      const { parseConfig: p1 } = await import('../../src/config/index.js');
      expect(p1().logLevel).toBe('warn');

      process.env.MCP_LOG_LEVEL = 'err';
      const { parseConfig: p2 } = await import('../../src/config/index.js');
      expect(p2().logLevel).toBe('error');
    });

    it('should handle aliases for environment', async () => {
      process.env.NODE_ENV = 'dev';
      const { parseConfig: p1 } = await import('../../src/config/index.js');
      expect(p1().environment).toBe('development');

      process.env.NODE_ENV = 'prod';
      const { parseConfig: p2 } = await import('../../src/config/index.js');
      expect(p2().environment).toBe('production');

      process.env.NODE_ENV = 'test';
      const { parseConfig: p3 } = await import('../../src/config/index.js');
      expect(p3().environment).toBe('testing');
    });

    it('should handle aliases for storage.providerType', async () => {
      process.env.STORAGE_PROVIDER_TYPE = 'mem';
      const { parseConfig: p1 } = await import('../../src/config/index.js');
      expect(p1().storage.providerType).toBe('in-memory');

      process.env.STORAGE_PROVIDER_TYPE = 'fs';
      const { parseConfig: p2 } = await import('../../src/config/index.js');
      expect(p2().storage.providerType).toBe('filesystem');
    });

    it('should handle aliases for openTelemetry.logLevel', async () => {
      process.env.OTEL_LOG_LEVEL = 'warning';
      const { parseConfig: p1 } = await import('../../src/config/index.js');
      expect(p1().openTelemetry.logLevel).toBe('WARN');

      process.env.OTEL_LOG_LEVEL = 'err';
      const { parseConfig: p2 } = await import('../../src/config/index.js');
      expect(p2().openTelemetry.logLevel).toBe('ERROR');

      process.env.OTEL_LOG_LEVEL = 'information';
      const { parseConfig: p3 } = await import('../../src/config/index.js');
      expect(p3().openTelemetry.logLevel).toBe('INFO');
    });
  });

  it('should handle telemetry configuration', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://localhost:4318';
    process.env.OTEL_SERVICE_NAME = 'TestService';

    const { parseConfig } = await import('../../src/config/index.js');
    const config = parseConfig();

    expect(config.openTelemetry.enabled).toBe(true);
    expect(config.openTelemetry.serviceName).toBe('TestService');
    expect(config.openTelemetry.tracesEndpoint).toBe('http://localhost:4318');
  });

  it('should disable telemetry by default if OTEL_ENABLED is not set', async () => {
    delete process.env.OTEL_ENABLED;
    const { parseConfig } = await import('../../src/config/index.js');
    const config = parseConfig();
    expect(config.openTelemetry.enabled).toBe(false);
  });

  it('should throw a Zod validation error for invalid configuration', async () => {
    process.env.MCP_HTTP_PORT = 'not-a-number';
    const { parseConfig } = await import('../../src/config/index.js');
    expect(() => parseConfig()).toThrow();
  });

  it('should derive serviceName and version from package.json when not set', async () => {
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_SERVICE_VERSION;
    const { parseConfig } = await import('../../src/config/index.js');
    const config = parseConfig();
    expect(config.openTelemetry.serviceName).toBeTruthy();
    expect(config.openTelemetry.serviceVersion).toBeTruthy();
  });

  it('should handle storage configuration', async () => {
    process.env.STORAGE_PROVIDER_TYPE = 'filesystem';
    process.env.STORAGE_FILESYSTEM_PATH = '/tmp/test-storage';
    const { parseConfig } = await import('../../src/config/index.js');
    const config = parseConfig();
    expect(config.storage.providerType).toBe('filesystem');
    expect(config.storage.filesystemPath).toBe('/tmp/test-storage');
  });

  it('should build oauth proxy configuration when env values are provided', async () => {
    process.env.OAUTH_PROXY_AUTHORIZATION_URL = 'https://auth.example.com';
    process.env.OAUTH_PROXY_TOKEN_URL = 'https://token.example.com';
    process.env.OAUTH_PROXY_REVOCATION_URL = 'https://revoke.example.com';
    process.env.OAUTH_PROXY_ISSUER_URL = 'https://issuer.example.com';
    process.env.OAUTH_PROXY_SERVICE_DOCUMENTATION_URL =
      'https://docs.example.com';
    process.env.OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS =
      ' https://app.example.com/callback , https://app.example.com/alt ';

    const { parseConfig } = await import('../../src/config/index.js');
    const config = parseConfig();

    expect(config.oauthProxy).toEqual({
      authorizationUrl: 'https://auth.example.com',
      tokenUrl: 'https://token.example.com',
      revocationUrl: 'https://revoke.example.com',
      issuerUrl: 'https://issuer.example.com',
      serviceDocumentationUrl: 'https://docs.example.com',
      defaultClientRedirectUris: [
        'https://app.example.com/callback',
        'https://app.example.com/alt',
      ],
    });
  });

  it('should add supabase configuration when url and anon key are set', async () => {
    process.env.SUPABASE_URL = 'https://supabase.example.com';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    const { parseConfig } = await import('../../src/config/index.js');
    const config = parseConfig();

    expect(config.supabase).toEqual({
      url: 'https://supabase.example.com',
      anonKey: 'anon-key',
      serviceRoleKey: 'service-role-key',
    });
  });

  it('should include speech configuration for enabled providers', async () => {
    process.env.SPEECH_TTS_ENABLED = 'true';
    process.env.SPEECH_TTS_PROVIDER = 'elevenlabs';
    process.env.SPEECH_TTS_API_KEY = 'tts-key';
    process.env.SPEECH_TTS_BASE_URL = 'https://tts.example.com';
    process.env.SPEECH_TTS_DEFAULT_VOICE_ID = 'voice-1';
    process.env.SPEECH_TTS_DEFAULT_MODEL_ID = 'model-1';
    process.env.SPEECH_TTS_TIMEOUT = '2000';

    process.env.SPEECH_STT_ENABLED = 'true';
    process.env.SPEECH_STT_PROVIDER = 'openai-whisper';
    process.env.SPEECH_STT_API_KEY = 'stt-key';
    process.env.SPEECH_STT_BASE_URL = 'https://stt.example.com';
    process.env.SPEECH_STT_DEFAULT_MODEL_ID = 'whisper-1';
    process.env.SPEECH_STT_TIMEOUT = '4000';

    const { parseConfig } = await import('../../src/config/index.js');
    const config = parseConfig();

    expect(config.speech).toEqual({
      tts: {
        enabled: true,
        provider: 'elevenlabs',
        apiKey: 'tts-key',
        baseUrl: 'https://tts.example.com',
        defaultVoiceId: 'voice-1',
        defaultModelId: 'model-1',
        timeout: 2000,
      },
      stt: {
        enabled: true,
        provider: 'openai-whisper',
        apiKey: 'stt-key',
        baseUrl: 'https://stt.example.com',
        defaultModelId: 'whisper-1',
        timeout: 4000,
      },
    });
  });
});
