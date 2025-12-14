/**
 * @fileoverview Unit tests for the RateLimiter utility.
 * @module tests/utils/security/rateLimiter.test
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { trace } from '@opentelemetry/api';
import type { z } from 'zod';

import { JsonRpcErrorCode } from '../../../src/types-global/errors.js';
import { logger } from '../../../src/utils/internal/logger.js';
import type { ConfigSchema } from '../../../src/config/index.js';
import type { RateLimiter as RateLimiterType } from '../../../src/utils/security/rateLimiter.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiterType;
  let config: z.infer<typeof ConfigSchema>;
  let RateLimiter: typeof RateLimiterType;
  let debugSpy: MockInstance;
  let getActiveSpanSpy: MockInstance;
  const spanMock = {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    addEvent: vi.fn(),
  };

  const originalEnv = { ...process.env };

  const createLimiter = () => {
    rateLimiter = new RateLimiter(config, logger as never);
    const timer = (
      rateLimiter as unknown as { cleanupTimer: NodeJS.Timeout | null }
    ).cleanupTimer;
    if (timer) {
      clearInterval(timer);
      (
        rateLimiter as unknown as { cleanupTimer: NodeJS.Timeout | null }
      ).cleanupTimer = null;
    }
    rateLimiter.configure({ cleanupInterval: 0 });
  };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    process.env.NODE_ENV = 'production';

    const configModule = await import('../../../src/config/index.js');
    const rateLimiterModule =
      await import('../../../src/utils/security/rateLimiter.js');
    config = configModule.config;
    RateLimiter = rateLimiterModule.RateLimiter;

    debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    getActiveSpanSpy = vi
      .spyOn(trace, 'getActiveSpan')
      .mockReturnValue(spanMock as never);
    createLimiter();
  });

  afterEach(() => {
    const timer = (
      rateLimiter as unknown as { cleanupTimer: NodeJS.Timeout | null }
    ).cleanupTimer;
    if (timer) {
      clearInterval(timer);
    }
    process.env = originalEnv;
    debugSpy.mockRestore();
    getActiveSpanSpy.mockRestore();
  });

  it('increments counts and throws an McpError after exceeding the limit', () => {
    const context = { requestId: 'req-1', timestamp: new Date().toISOString() };
    rateLimiter.configure({ windowMs: 1000, maxRequests: 1 });

    rateLimiter.check('user:1', context);
    expect(rateLimiter.getStatus('user:1')).toMatchObject({
      current: 1,
      remaining: 0,
    });

    let thrown: unknown;
    try {
      rateLimiter.check('user:1', context);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(thrown as object).toMatchObject({
      code: JsonRpcErrorCode.RateLimited,
    });

    const status = rateLimiter.getStatus('user:1');
    expect(status).toMatchObject({ current: 2, limit: 1, remaining: 0 });
    expect(spanMock.addEvent).toHaveBeenCalledWith('rate_limit_exceeded', {
      'mcp.rate_limit.wait_time_seconds': expect.any(Number),
    });
  });

  it('skips rate limiting in development when configured to do so', async () => {
    process.env.NODE_ENV = 'development';
    // Re-import modules to get the updated config
    const configModule = await import('../../../src/config/index.js');
    const rateLimiterModule =
      await import('../../../src/utils/security/rateLimiter.js');
    config = configModule.parseConfig(); // Use parseConfig to get a fresh config
    RateLimiter = rateLimiterModule.RateLimiter;

    // Create a new limiter with the development config
    const devRateLimiter = new RateLimiter(config, logger as never);
    devRateLimiter.configure({
      windowMs: 1000,
      maxRequests: 1,
      skipInDevelopment: true,
    });

    const context = {
      requestId: 'dev-req',
      timestamp: new Date().toISOString(),
    };

    expect(() => {
      devRateLimiter.check('dev:key', context);
      devRateLimiter.check('dev:key', context);
    }).not.toThrow();

    expect(spanMock.setAttribute).toHaveBeenCalledWith(
      'mcp.rate_limit.skipped',
      'development',
    );
  });

  it('resets internal state and logs the action', () => {
    rateLimiter.configure({ windowMs: 1000, maxRequests: 1 });
    rateLimiter.check('to-reset', {
      requestId: 'reset-req',
      timestamp: new Date().toISOString(),
    });

    rateLimiter.reset();

    expect(rateLimiter.getStatus('to-reset')).toBeNull();
    expect(debugSpy).toHaveBeenCalledWith(
      'Rate limiter reset, all limits cleared',
      expect.objectContaining({ operation: 'RateLimiter.reset' }),
    );
  });

  it('cleans up expired entries when the cleanup timer runs', () => {
    const now = Date.now();
    const entryKey = 'expired';
    (
      rateLimiter as unknown as {
        limits: Map<string, { count: number; resetTime: number }>;
      }
    ).limits.set(entryKey, { count: 1, resetTime: now - 1000 });

    (
      rateLimiter as unknown as { cleanupExpiredEntries: () => void }
    ).cleanupExpiredEntries();

    expect(rateLimiter.getStatus(entryKey)).toBeNull();
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cleaned up 1 expired rate limit entries'),
      expect.objectContaining({
        operation: 'RateLimiter.cleanupExpiredEntries',
      }),
    );
  });

  it('should return null status for a key that has not been checked', () => {
    const status = rateLimiter.getStatus('never-checked');
    expect(status).toBeNull();
  });

  it('should allow configuring the rate limiter and return config', () => {
    rateLimiter.configure({ windowMs: 5000, maxRequests: 10 });
    const conf = rateLimiter.getConfig();
    expect(conf.windowMs).toBe(5000);
    expect(conf.maxRequests).toBe(10);
  });

  it('should start cleanup timer when cleanup interval is set', () => {
    rateLimiter.configure({ cleanupInterval: 1000 });
    const timer = (
      rateLimiter as unknown as { cleanupTimer: NodeJS.Timeout | null }
    ).cleanupTimer;
    expect(timer).not.toBeNull();

    // Clean up timer
    if (timer) {
      clearInterval(timer);
    }
  });

  it('should unref the cleanup timer when supported by the environment', () => {
    const unrefSpy = vi.fn();
    const fakeTimer = {
      unref: unrefSpy,
      ref: vi.fn(),
    } as unknown as NodeJS.Timeout;

    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue(fakeTimer);

    rateLimiter.configure({ cleanupInterval: 250 });

    expect(unrefSpy).toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    rateLimiter.configure({ cleanupInterval: 0 });
  });

  it('should dispose cleanup resources and clear tracked limits', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const fakeTimer = {
      unref: vi.fn(),
      ref: vi.fn(),
    } as unknown as NodeJS.Timeout;
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue(fakeTimer);

    rateLimiter.configure({ cleanupInterval: 500 });
    setIntervalSpy.mockRestore();

    rateLimiter.configure({ windowMs: 1000, maxRequests: 2 });
    rateLimiter.check('dispose-key', {
      requestId: 'dispose-req',
      timestamp: new Date().toISOString(),
    });
    expect(rateLimiter.getStatus('dispose-key')).not.toBeNull();

    rateLimiter.dispose();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(rateLimiter.getStatus('dispose-key')).toBeNull();

    clearIntervalSpy.mockRestore();
  });
});
