/**
 * @fileoverview Tests for the startup banner utility.
 * @module tests/utils/internal/startupBanner.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logStartupBanner } from '../../../src/utils/internal/startupBanner.js';

const originalIsTTYDescriptor = Object.getOwnPropertyDescriptor(
  process.stdout,
  'isTTY',
);

const restoreIsTTY = () => {
  if (originalIsTTYDescriptor) {
    Object.defineProperty(process.stdout, 'isTTY', originalIsTTYDescriptor);
  } else {
    delete (process.stdout as unknown as Record<string, unknown>).isTTY;
  }
};

describe('logStartupBanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreIsTTY();
  });

  it('logs the banner to stdout when stdout is a TTY (no transport type)', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logStartupBanner('Test banner');

    expect(logSpy).toHaveBeenCalledWith('Test banner');
  });

  it('logs the banner to stdout when stdout is a TTY in HTTP mode', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logStartupBanner('Test banner', 'http');

    expect(logSpy).toHaveBeenCalledWith('Test banner');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs the banner to stderr when stdout is a TTY in STDIO mode', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logStartupBanner('Test banner', 'stdio');

    expect(errorSpy).toHaveBeenCalledWith('Test banner');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('does not log when stdout is not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: false,
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logStartupBanner('Should not appear');

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
