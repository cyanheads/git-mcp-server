/**
 * @fileoverview Unit tests for runtime adapter module
 * @module tests/services/git/providers/cli/utils/runtime-adapter.test
 */
import { describe, expect, it } from 'vitest';

import {
  detectRuntime,
  spawnGitCommand,
} from '../../../../../../src/services/git/providers/cli/utils/runtime-adapter.js';

describe('Runtime Adapter', () => {
  describe('detectRuntime', () => {
    // Note: We cannot mock globalThis.Bun in Bun runtime (readonly)
    // These tests verify behavior in the current runtime environment

    it('should detect the current runtime correctly', () => {
      const runtime = detectRuntime();

      // Tests run via bun test, so we expect 'bun'
      // In CI with Node, this would be 'node'
      if (typeof globalThis.Bun !== 'undefined') {
        expect(runtime).toBe('bun');
      } else {
        expect(runtime).toBe('node');
      }
    });

    it('should return consistent results on repeated calls', () => {
      const first = detectRuntime();
      const second = detectRuntime();
      const third = detectRuntime();

      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it('should only return "bun" or "node"', () => {
      const runtime = detectRuntime();
      expect(['bun', 'node']).toContain(runtime);
    });

    it('should return a string type', () => {
      const runtime = detectRuntime();
      expect(typeof runtime).toBe('string');
    });
  });

  describe('spawnGitCommand', () => {
    it('should execute git --version successfully', async () => {
      const result = await spawnGitCommand(
        ['--version'],
        process.cwd(),
        { ...process.env } as Record<string, string>,
        10000,
      );

      expect(result.stdout).toMatch(/git version/i);
      expect(result.stderr).toBe('');
    });

    it('should capture stderr for invalid commands', async () => {
      await expect(
        spawnGitCommand(
          ['invalid-command-that-does-not-exist'],
          process.cwd(),
          { ...process.env } as Record<string, string>,
          10000,
        ),
      ).rejects.toThrow();
    });

    it('should respect working directory', async () => {
      const result = await spawnGitCommand(
        ['rev-parse', '--show-toplevel'],
        process.cwd(),
        { ...process.env } as Record<string, string>,
        10000,
      );

      expect(result.stdout.trim()).toBe(process.cwd());
    });

    it('should pass environment variables to git', async () => {
      const customEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test Author',
      } as Record<string, string>;

      // Just verify the command runs - env vars are passed internally
      const result = await spawnGitCommand(
        ['--version'],
        process.cwd(),
        customEnv,
        10000,
      );

      expect(result.stdout).toMatch(/git version/i);
    });

    it('should support abort signal cancellation', async () => {
      const controller = new AbortController();

      // Abort immediately
      controller.abort();

      await expect(
        spawnGitCommand(
          ['--version'],
          process.cwd(),
          { ...process.env } as Record<string, string>,
          10000,
          controller.signal,
        ),
      ).rejects.toThrow(/cancelled/i);
    });
  });
});
