import 'reflect-metadata';
// This setup file is preloaded by Bun (see bunfig.toml).
// It provides a lightweight Vitest compatibility layer so tests can run under `bun test`.

import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Ensure test env so logger suppresses noisy warnings
if (typeof process !== 'undefined' && process.env && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Bun compatibility shims — Bun's test runner lacks some Vitest APIs.
// TODO: Remove these once Bun's test runner natively supports vi.mock and fake timers.
if (!(vi as any).mock && typeof (vi as any).module === 'function') {
  (vi as any).mock = (vi as any).module.bind(vi);
}

let originalNow: (() => number) | null = null;
let base = 0;
let offset = 0;
(vi as any).useFakeTimers = () => {
  if (!originalNow) {
    originalNow = Date.now;
    base = originalNow();
    offset = 0;
    // @ts-ignore -- intentional Date.now override for fake timers
    Date.now = () => base + offset;
  }
};
(vi as any).advanceTimersByTime = (ms: number) => {
  offset += ms;
};
(vi as any).setSystemTime = (d: Date | number) => {
  base = typeof d === 'number' ? d : (d as Date).getTime();
  offset = 0;
};
(vi as any).useRealTimers = () => {
  if (originalNow) {
    // @ts-ignore -- restore original Date.now
    Date.now = originalNow;
    originalNow = null;
  }
};

// Pre-mock modules that are imported before tests call vi.mock
// Skip these mocks for integration tests so we exercise the real stack.
const IS_INTEGRATION = process.env.INTEGRATION === '1';
if (!IS_INTEGRATION) {
  try {
    (vi as any).mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
      class McpServer {
        connect = (vi as any).fn(async () => {});
        constructor(..._args: any[]) {}
      }
      return { McpServer };
    });
  } catch {}

  try {
    (vi as any).mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
      const StdioServerTransport: any = (vi as any).fn(
        function StdioServerTransport(this: any, ..._args: any[]) {},
      );
      return { StdioServerTransport };
    });
  } catch {}

  try {
    (vi as any).mock('chrono-node', () => ({
      parseDate: (vi as any).fn(() => null),
      parse: (vi as any).fn(() => []),
    }));
  } catch {}
}

// Ensure global vi exists for any indirect references
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).vi = (globalThis as any).vi ?? vi;

// Global test setup without MSW - tests use real APIs or isolated MSW servers
beforeAll(() => {
  // Any global setup can go here
});

afterEach(() => {
  // Clean up between tests
});

afterAll(() => {
  // Global cleanup
});
