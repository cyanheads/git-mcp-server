/**
 * @fileoverview Integration tests for the Logger utility.
 * These tests validate file creation, log level handling, and rate limiting with Pino.
 */
import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { config } from '../../../src/config/index.js';
import { Logger } from '../../../src/utils/internal/logger.js';

const LOGS_DIR = path.join(process.cwd(), 'logs', 'logger-test');
const COMBINED_LOG_PATH = path.join(LOGS_DIR, 'combined.log');
const ERROR_LOG_PATH = path.join(LOGS_DIR, 'error.log');
const INTERACTIONS_LOG_PATH = path.join(LOGS_DIR, 'interactions.log');

// Override config to use a dedicated test directory
config.logsPath = LOGS_DIR;

function readJsonLog(filePath: string): any[] {
  if (!existsSync(filePath)) {
    return [];
  }
  const content = readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/**
 * Poll a log file until a predicate matches an entry, or timeout.
 * Avoids brittle fixed-delay waits for Pino's async file transport.
 */
async function waitForLogEntry(
  filePath: string,
  predicate: (entry: any) => boolean,
  timeoutMs = 3000,
  intervalMs = 50,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = readJsonLog(filePath);
    const match = entries.find(predicate);
    if (match) return match;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error(
    `Timed out waiting for log entry in ${filePath} after ${timeoutMs}ms`,
  );
}

/**
 * Poll until a file exists on disk.
 */
async function waitForFile(
  filePath: string,
  timeoutMs = 3000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) return;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error(
    `Timed out waiting for file ${filePath} after ${timeoutMs}ms`,
  );
}

describe('Logger Integration (Pino)', () => {
  let logger: Logger;

  beforeAll(async () => {
    // Use real timers for this test suite to avoid conflicts with setTimeout
    if (typeof (vi as any).useRealTimers === 'function') {
      (vi as any).useRealTimers();
    }

    // Clean up old logs if they exist
    if (existsSync(LOGS_DIR)) {
      rmSync(LOGS_DIR, { recursive: true, force: true });
    }
    // We get a singleton instance, so we will reuse it. Tests should not interfere.
    logger = Logger.getInstance();
    if (!logger.isInitialized()) {
      await logger.initialize('debug');
    }
  });

  afterAll(async () => {
    await logger.close();
    // Clean up the test log directory
    if (existsSync(LOGS_DIR)) {
      rmSync(LOGS_DIR, { recursive: true, force: true });
    }
  });

  it('should create log files on initialization', async () => {
    await waitForFile(COMBINED_LOG_PATH);
    await waitForFile(ERROR_LOG_PATH);
    expect(existsSync(COMBINED_LOG_PATH)).toBe(true);
    expect(existsSync(ERROR_LOG_PATH)).toBe(true);
  });

  it('should write an info message to the combined log but not the error log', async () => {
    logger.info('This is a pino info message', {
      testId: 'pino-info-test',
      requestId: 'test-pino-1',
      timestamp: new Date().toISOString(),
    });

    const entry = await waitForLogEntry(
      COMBINED_LOG_PATH,
      (log) => log.testId === 'pino-info-test',
    );
    expect(entry.msg).toBe('This is a pino info message');
    expect(entry.level).toBe(30); // Pino's level for info

    // Info should NOT appear in the error log — give a brief window then verify absence
    await new Promise((res) => setTimeout(res, 100));
    const errorLog = readJsonLog(ERROR_LOG_PATH);
    const errorLogEntry = errorLog.find(
      (log) => log.testId === 'pino-info-test',
    );
    expect(errorLogEntry).toBeUndefined();
  });

  it('should write an error message to both combined and error logs', async () => {
    logger.error('This is a pino error message', new Error('test error'), {
      testId: 'pino-error-test',
      requestId: 'test-pino-2',
      timestamp: new Date().toISOString(),
    });

    const combinedEntry = await waitForLogEntry(
      COMBINED_LOG_PATH,
      (log) => log.testId === 'pino-error-test',
    );
    expect(combinedEntry.msg).toBe('This is a pino error message');
    expect(combinedEntry.level).toBe(50); // Pino's level for error
    expect(combinedEntry.err.message).toBe('test error');

    const errorEntry = await waitForLogEntry(
      ERROR_LOG_PATH,
      (log) => log.testId === 'pino-error-test',
    );
    expect(errorEntry.msg).toBe('This is a pino error message');
  });

  it('should respect the log level and not log debug messages if level is info', async () => {
    // Read current log size to check for new entries later
    const initialLog = readFileSync(COMBINED_LOG_PATH, 'utf-8');

    logger.setLevel('info');
    logger.debug('This pino debug message should not be logged', {
      testId: 'pino-debug-test',
      requestId: 'test-pino-3',
      timestamp: new Date().toISOString(),
    });

    // Debug messages are filtered at the Pino level — they never reach the transport.
    // A brief wait is sufficient to confirm nothing was written.
    await new Promise((res) => setTimeout(res, 100));

    const updatedLog = readFileSync(COMBINED_LOG_PATH, 'utf-8');
    const newLogContent = updatedLog.substring(initialLog.length);
    expect(newLogContent).not.toContain('pino-debug-test');

    // Reset level for other tests
    logger.setLevel('debug');
  });

  it('should log emergency level messages', async () => {
    logger.emerg('Emergency situation detected', {
      testId: 'pino-emerg-test',
      requestId: 'test-pino-emerg',
      timestamp: new Date().toISOString(),
    });

    const entry = await waitForLogEntry(
      COMBINED_LOG_PATH,
      (log) => log.testId === 'pino-emerg-test',
    );
    expect(entry.msg).toBe('Emergency situation detected');
    // Pino fatal level is 60
    expect(entry.level).toBeGreaterThanOrEqual(50);
  });

  it('should log critical level messages', async () => {
    logger.crit('Critical error occurred', {
      testId: 'pino-crit-test',
      requestId: 'test-pino-crit',
      timestamp: new Date().toISOString(),
    });

    const entry = await waitForLogEntry(
      COMBINED_LOG_PATH,
      (log) => log.testId === 'pino-crit-test',
    );
    expect(entry.msg).toBe('Critical error occurred');
    // Mapped to error level (50) in Pino
    expect(entry.level).toBeGreaterThanOrEqual(50);
  });

  it('should log alert level messages', async () => {
    logger.alert('Alert condition triggered', {
      testId: 'pino-alert-test',
      requestId: 'test-pino-alert',
      timestamp: new Date().toISOString(),
    });

    const entry = await waitForLogEntry(
      COMBINED_LOG_PATH,
      (log) => log.testId === 'pino-alert-test',
    );
    expect(entry.msg).toBe('Alert condition triggered');
    // Mapped to error/fatal level in Pino
    expect(entry.level).toBeGreaterThanOrEqual(50);
  });

  it('should log notice level messages', async () => {
    logger.notice('Notice level message', {
      testId: 'pino-notice-test',
      requestId: 'test-pino-notice',
      timestamp: new Date().toISOString(),
    });

    const entry = await waitForLogEntry(
      COMBINED_LOG_PATH,
      (log) => log.testId === 'pino-notice-test',
    );
    expect(entry.msg).toBe('Notice level message');
    // Mapped to info level (30) in Pino
    expect(entry.level).toBeGreaterThanOrEqual(30);
  });

  it('should log fatal level messages by delegating to emerg', async () => {
    logger.fatal('Fatal condition encountered', {
      testId: 'pino-fatal-test',
      requestId: 'test-pino-fatal',
      timestamp: new Date().toISOString(),
    });

    const entry = await waitForLogEntry(
      COMBINED_LOG_PATH,
      (log) => log.testId === 'pino-fatal-test',
    );
    expect(entry.msg).toBe('Fatal condition encountered');
    expect(entry.level).toBeGreaterThanOrEqual(50);
  });

  it('writes interaction events when an interaction logger is available', async () => {
    logger.logInteraction('test-interaction', {
      context: {
        testId: 'interaction-test',
        requestId: 'interaction-1',
        timestamp: new Date().toISOString(),
      },
      payloadSize: 42,
    });

    const entry = await waitForLogEntry(
      INTERACTIONS_LOG_PATH,
      (log) => log.interactionName === 'test-interaction',
    );
    expect(entry).toBeDefined();
    expect(entry.payloadSize).toBe(42);
  });

  it('warns when interaction logging is requested but unavailable', () => {
    const loggerWithInternals = logger as unknown as {
      interactionLogger?: unknown;
    };
    const originalInteractionLogger = loggerWithInternals.interactionLogger;
    loggerWithInternals.interactionLogger = undefined;

    const warningSpy = vi.spyOn(logger, 'warning');

    logger.logInteraction('missing-interaction', {
      context: {
        requestId: 'missing-interaction',
        timestamp: new Date().toISOString(),
      },
    });

    expect(warningSpy).toHaveBeenCalledWith(
      'Interaction logger not available.',
      expect.objectContaining({ requestId: 'missing-interaction' }),
    );

    warningSpy.mockRestore();
    loggerWithInternals.interactionLogger = originalInteractionLogger;
  });
});

describe('Logger Transport Mode Handling', () => {
  afterAll(async () => {
    // Clean up any test loggers
    const testLogger = Logger.getInstance();
    if (testLogger.isInitialized()) {
      await testLogger.close();
    }
  });

  it('should output plain JSON (no ANSI codes) to stderr when initialized with stdio transport', async () => {
    const stdioLogger = Logger.getInstance();

    // Close any existing logger state
    if (stdioLogger.isInitialized()) {
      await stdioLogger.close();
    }

    // Create a test log directory for this specific test
    const stdioTestLogDir = path.join(process.cwd(), 'logs', 'stdio-test');
    const stdioTestLogPath = path.join(stdioTestLogDir, 'combined.log');

    // Temporarily override config for this test
    const originalLogsPath = config.logsPath;
    config.logsPath = stdioTestLogDir;

    // Clean up old logs if they exist
    if (existsSync(stdioTestLogDir)) {
      rmSync(stdioTestLogDir, { recursive: true, force: true });
    }

    // Initialize with STDIO transport mode
    await stdioLogger.initialize('info', 'stdio');

    // Wait for file transport to create the log file
    await waitForFile(stdioTestLogPath);

    // Write a test message
    stdioLogger.info('STDIO transport test message', {
      testId: 'stdio-ansi-test',
      requestId: 'test-stdio-1',
      timestamp: new Date().toISOString(),
    });

    // Wait for the entry to appear
    const testLog = await waitForLogEntry(
      stdioTestLogPath,
      (log) => log.testId === 'stdio-ansi-test',
    );

    // Read the raw file to verify format
    const logContent = readFileSync(stdioTestLogPath, 'utf-8');

    // CRITICAL: Check for ANSI escape codes (e.g., [35m, [39m, [32m, etc.)
    // The MCP specification requires clean JSON output with no color codes
    const ansiPattern = /\x1b\[\d+m/;
    expect(ansiPattern.test(logContent)).toBe(false);

    // Verify the log entry is valid JSON (MCP clients must be able to parse)
    const logLines = logContent
      .split('\n')
      .filter((line) => line.trim() !== '');

    expect(logLines.length).toBeGreaterThan(0);

    for (const line of logLines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    // Verify our test message was logged with correct content
    expect(testLog.msg).toBe('STDIO transport test message');

    // Verify logger was initialized with stdio transport awareness
    expect(stdioLogger.isInitialized()).toBe(true);

    // Cleanup
    await stdioLogger.close();
    if (existsSync(stdioTestLogDir)) {
      rmSync(stdioTestLogDir, { recursive: true, force: true });
    }

    // Restore original config
    config.logsPath = originalLogsPath;
  });

  it('should allow colored output when initialized with http transport', async () => {
    // This test ensures HTTP mode can use pino-pretty in development
    // We just verify it doesn't throw an error during initialization
    const httpLogger = Logger.getInstance();

    // Close any existing logger state
    if (httpLogger.isInitialized()) {
      await httpLogger.close();
    }

    // Initialize with HTTP transport mode (should allow colors in dev)
    await httpLogger.initialize('info', 'http');

    // Verify logger is initialized successfully
    expect(httpLogger.isInitialized()).toBe(true);

    // Cleanup
    await httpLogger.close();
  });
});
