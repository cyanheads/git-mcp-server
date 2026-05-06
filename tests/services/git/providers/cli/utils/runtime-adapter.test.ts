/**
 * @fileoverview Unit tests for runtime adapter module
 * @module tests/services/git/providers/cli/utils/runtime-adapter.test
 */
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

  /**
   * Regression: shell-injection resistance.
   *
   * Stages a fake `git` shim on PATH that records argv, then sends payloads
   * containing shell metacharacters as argument values. Argv-based spawning
   * must deliver the payload to git verbatim — no $(), backtick, or `;`
   * substitution may execute.
   */
  describe('spawnGitCommand — shell injection resistance', () => {
    let sandbox: string;
    let argvLog: string;
    let originalPath: string | undefined;

    beforeEach(async () => {
      sandbox = await mkdtemp(path.join(tmpdir(), 'git-injection-'));
      argvLog = path.join(sandbox, 'argv.txt');
      const binDir = path.join(sandbox, 'bin');
      await mkdir(binDir, { recursive: true });

      const shim = path.join(binDir, 'git');
      await writeFile(
        shim,
        [
          '#!/usr/bin/env bash',
          `printf '%s\\n' "$@" > "${argvLog}"`,
          'exit 0',
          '',
        ].join('\n'),
        'utf8',
      );
      await chmod(shim, 0o755);

      originalPath = process.env.PATH;
      process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ''}`;
    });

    afterEach(async () => {
      if (originalPath !== undefined) {
        process.env.PATH = originalPath;
      }
      await rm(sandbox, { recursive: true, force: true });
    });

    const expectPayloadPassedAsLiteral = async (payload: string) => {
      const marker = path.join(sandbox, 'INJECTED');
      // Embed the marker path inside the payload so a real shell evaluation
      // would visibly create the file. Argv spawning leaves it untouched.
      const armed = payload.replace('__MARKER__', marker);

      const result = await spawnGitCommand(
        [
          'clone',
          'https://example.com/repo.git',
          path.join(sandbox, 'dest'),
          '--branch',
          armed,
        ],
        sandbox,
        { ...process.env } as Record<string, string>,
        10000,
      );

      await expect(access(marker)).rejects.toThrow();
      const argv = (await readFile(argvLog, 'utf8')).split('\n');
      expect(argv).toContain(armed);
      expect(result.exitCode).toBe(0);
    };

    it('passes $(...) command substitution as literal argv', async () => {
      await expectPayloadPassedAsLiteral('main$(printf injected > __MARKER__)');
    });

    it('passes backtick command substitution as literal argv', async () => {
      await expectPayloadPassedAsLiteral('main`printf injected > __MARKER__`');
    });

    it('passes `;` command separator as literal argv', async () => {
      await expectPayloadPassedAsLiteral('main; printf injected > __MARKER__');
    });

    it('passes `&&` command chain as literal argv', async () => {
      await expectPayloadPassedAsLiteral(
        'main && printf injected > __MARKER__',
      );
    });

    it('passes `|` pipe as literal argv', async () => {
      await expectPayloadPassedAsLiteral('main | tee __MARKER__');
    });
  });
});
