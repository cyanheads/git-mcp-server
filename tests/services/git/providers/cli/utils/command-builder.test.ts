/**
 * @fileoverview Unit tests for git command builder utilities
 * @module tests/services/git/providers/cli/utils/command-builder.test
 */
import { describe, expect, it } from 'vitest';

import {
  buildGitCommand,
  buildGitEnv,
  escapeShellArg,
  validateGitArgs,
} from '../../../../../../src/services/git/providers/cli/utils/command-builder.js';

describe('Command Builder', () => {
  describe('buildGitCommand', () => {
    it('should build a simple command', () => {
      const result = buildGitCommand({ command: 'status' });
      expect(result).toEqual(['status']);
    });

    it('should build a command with arguments', () => {
      const result = buildGitCommand({
        command: 'log',
        args: ['--oneline', '-n', '5'],
      });
      expect(result).toEqual(['log', '--oneline', '-n', '5']);
    });

    it('should handle empty args array', () => {
      const result = buildGitCommand({
        command: 'status',
        args: [],
      });
      expect(result).toEqual(['status']);
    });

    it('should preserve argument order', () => {
      const result = buildGitCommand({
        command: 'commit',
        args: ['-m', 'message', '--amend'],
      });
      expect(result).toEqual(['commit', '-m', 'message', '--amend']);
    });

    it('should handle arguments with special characters', () => {
      const result = buildGitCommand({
        command: 'commit',
        args: ['-m', 'feat: add "quotes" and $pecial chars'],
      });
      expect(result).toEqual([
        'commit',
        '-m',
        'feat: add "quotes" and $pecial chars',
      ]);
    });
  });

  describe('buildGitEnv', () => {
    it('should preserve PATH from process.env', () => {
      const result = buildGitEnv();

      // PATH should be preserved (critical for finding git executable)
      expect(result.PATH).toBe(process.env.PATH);
    });

    it('should set GIT_TERMINAL_PROMPT to 0', () => {
      const result = buildGitEnv();

      // Disable interactive prompts
      expect(result.GIT_TERMINAL_PROMPT).toBe('0');
    });

    it('should set UTF-8 locale', () => {
      const result = buildGitEnv();

      expect(result.LANG).toBe('en_US.UTF-8');
      expect(result.LC_ALL).toBe('en_US.UTF-8');
    });

    it('should allow overriding defaults with additionalEnv', () => {
      const result = buildGitEnv({
        GIT_TERMINAL_PROMPT: '1',
        CUSTOM_VAR: 'custom_value',
      });

      expect(result.GIT_TERMINAL_PROMPT).toBe('1');
      expect(result.CUSTOM_VAR).toBe('custom_value');
    });

    it('should preserve other process environment variables', () => {
      const result = buildGitEnv();

      // HOME/USER should be preserved
      if (process.env.HOME) {
        expect(result.HOME).toBe(process.env.HOME);
      }
      if (process.env.USER) {
        expect(result.USER).toBe(process.env.USER);
      }
    });

    it('should return a new object each time', () => {
      const result1 = buildGitEnv();
      const result2 = buildGitEnv();

      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });

    it('should not mutate process.env', () => {
      const originalTerminalPrompt = process.env.GIT_TERMINAL_PROMPT;

      buildGitEnv({ GIT_TERMINAL_PROMPT: 'modified' });

      expect(process.env.GIT_TERMINAL_PROMPT).toBe(originalTerminalPrompt);
    });

    it('should handle undefined additionalEnv', () => {
      const result = buildGitEnv(undefined);

      expect(result.GIT_TERMINAL_PROMPT).toBe('0');
      expect(result.PATH).toBe(process.env.PATH);
    });

    it('should handle empty additionalEnv', () => {
      const result = buildGitEnv({});

      expect(result.GIT_TERMINAL_PROMPT).toBe('0');
      expect(result.PATH).toBe(process.env.PATH);
    });
  });

  describe('escapeShellArg', () => {
    it('should wrap simple strings in single quotes', () => {
      expect(escapeShellArg('hello')).toBe("'hello'");
    });

    it('should escape single quotes within string', () => {
      expect(escapeShellArg("it's")).toBe("'it'\\''s'");
    });

    it('should handle strings with spaces', () => {
      expect(escapeShellArg('hello world')).toBe("'hello world'");
    });

    it('should handle empty strings', () => {
      expect(escapeShellArg('')).toBe("''");
    });

    it('should handle strings with special shell characters', () => {
      // These should be safe within single quotes
      expect(escapeShellArg('$VAR')).toBe("'$VAR'");
      expect(escapeShellArg('`cmd`')).toBe("'`cmd`'");
      expect(escapeShellArg('$(cmd)')).toBe("'$(cmd)'");
      expect(escapeShellArg('a;b')).toBe("'a;b'");
      expect(escapeShellArg('a|b')).toBe("'a|b'");
    });

    it('should handle multiple single quotes', () => {
      expect(escapeShellArg("a'b'c")).toBe("'a'\\''b'\\''c'");
    });
  });

  describe('validateGitArgs', () => {
    it('should accept valid arguments', () => {
      expect(() => validateGitArgs(['status'])).not.toThrow();
      expect(() => validateGitArgs(['commit', '-m', 'message'])).not.toThrow();
      expect(() =>
        validateGitArgs(['log', '--oneline', '-n', '10']),
      ).not.toThrow();
    });

    it('should reject null bytes in arguments', () => {
      expect(() => validateGitArgs(['status\0'])).toThrow(/null byte/i);
      expect(() =>
        validateGitArgs(['commit', '-m', 'msg\0with\0nulls']),
      ).toThrow(/null byte/i);
    });

    it('should accept safe short flags', () => {
      expect(() => validateGitArgs(['-v'])).not.toThrow();
      expect(() => validateGitArgs(['-f'])).not.toThrow();
      expect(() => validateGitArgs(['-q'])).not.toThrow();
      expect(() => validateGitArgs(['-m', 'message'])).not.toThrow();
    });

    it('should accept safe long flags', () => {
      expect(() => validateGitArgs(['--version'])).not.toThrow();
      expect(() => validateGitArgs(['--help'])).not.toThrow();
      expect(() => validateGitArgs(['--porcelain'])).not.toThrow();
      expect(() => validateGitArgs(['--oneline'])).not.toThrow();
    });

    it('should accept flags with values', () => {
      expect(() => validateGitArgs(['--format=%H'])).not.toThrow();
      expect(() => validateGitArgs(['--max-count=10'])).not.toThrow();
      expect(() => validateGitArgs(['--initial-branch=main'])).not.toThrow();
    });

    it('should handle shell metacharacters safely (array spawn protection)', () => {
      // These are safe because we use array-based spawn, not shell
      expect(() =>
        validateGitArgs(['commit', '-m', 'msg; rm -rf /']),
      ).not.toThrow();
      expect(() =>
        validateGitArgs(['commit', '-m', 'msg | cat']),
      ).not.toThrow();
      expect(() =>
        validateGitArgs(['commit', '-m', 'msg $HOME']),
      ).not.toThrow();
      expect(() =>
        validateGitArgs(['commit', '-m', 'msg `whoami`']),
      ).not.toThrow();
    });

    it('should accept newlines in commit messages', () => {
      expect(() =>
        validateGitArgs(['commit', '-m', 'line1\nline2\nline3']),
      ).not.toThrow();
    });

    it('should handle empty args array', () => {
      expect(() => validateGitArgs([])).not.toThrow();
    });

    it('should accept file paths as arguments', () => {
      expect(() => validateGitArgs(['add', 'src/file.ts'])).not.toThrow();
      expect(() => validateGitArgs(['add', '../parent/file.ts'])).not.toThrow();
      expect(() => validateGitArgs(['add', './relative/path'])).not.toThrow();
    });
  });
});
