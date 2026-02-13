/**
 * @fileoverview Unit tests for git clean operation
 * @module tests/services/git/providers/cli/operations/core/clean.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeClean } from '@/services/git/providers/cli/operations/core/clean.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeClean', () => {
  const mockContext: GitOperationContext = {
    workingDirectory: '/test/repo',
    requestContext: {
      requestId: 'test-request-id',
    } as RequestContext,
    tenantId: 'test-tenant',
  };

  let mockExecGit: ReturnType<typeof vi.fn<ExecGitFn>>;

  beforeEach(() => {
    mockExecGit = vi.fn<ExecGitFn>();
  });

  describe('force clean', () => {
    it('passes -f flag when force is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClean({ force: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('clean');
      expect(args).toContain('-f');
    });

    it('returns empty arrays when nothing to clean', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeClean(
        { force: true },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.filesRemoved).toEqual([]);
      expect(result.directoriesRemoved).toEqual([]);
      expect(result.dryRun).toBe(false);
    });
  });

  describe('dry run', () => {
    it('passes -n flag when dryRun is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClean(
        { force: false, dryRun: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-n');
      expect(args).not.toContain('-f');
    });

    it('sets dryRun to true in result', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Would remove temp.txt\nWould remove build.log\n',
        stderr: '',
      });

      const result = await executeClean(
        { force: false, dryRun: true },
        mockContext,
        mockExecGit,
      );

      expect(result.dryRun).toBe(true);
    });

    it('dryRun takes precedence over force', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClean(
        { force: true, dryRun: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-n');
      expect(args).not.toContain('-f');
    });
  });

  describe('directories option', () => {
    it('passes -d flag when directories is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClean(
        { force: true, directories: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-d');
    });

    it('does not pass -d flag when directories is false', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClean(
        { force: true, directories: false },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('-d');
    });
  });

  describe('ignored option', () => {
    it('passes -x flag when ignored is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClean(
        { force: true, ignored: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-x');
    });
  });

  describe('output parsing', () => {
    it('parses "Removing" lines as files removed', async () => {
      const output = 'Removing temp.txt\nRemoving build.log\n';

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeClean(
        { force: true },
        mockContext,
        mockExecGit,
      );

      expect(result.filesRemoved).toEqual(['temp.txt', 'build.log']);
      expect(result.directoriesRemoved).toEqual([]);
    });

    it('parses "Would remove" lines as files in dry run', async () => {
      const output = 'Would remove temp.txt\nWould remove debug.log\n';

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeClean(
        { force: false, dryRun: true },
        mockContext,
        mockExecGit,
      );

      expect(result.filesRemoved).toEqual(['temp.txt', 'debug.log']);
    });

    it('separates directories (trailing slash) from files', async () => {
      const output =
        'Removing temp.txt\nRemoving build/\nRemoving node_modules/\n';

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeClean(
        { force: true, directories: true },
        mockContext,
        mockExecGit,
      );

      expect(result.filesRemoved).toEqual(['temp.txt']);
      expect(result.directoriesRemoved).toEqual(['build/', 'node_modules/']);
    });

    it('handles mixed "Removing" and "Would remove" correctly', async () => {
      const output = 'Would remove old.txt\nWould remove cache/\n';

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeClean(
        { force: false, dryRun: true, directories: true },
        mockContext,
        mockExecGit,
      );

      expect(result.filesRemoved).toEqual(['old.txt']);
      expect(result.directoriesRemoved).toEqual(['cache/']);
    });

    it('handles empty output', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeClean(
        { force: true },
        mockContext,
        mockExecGit,
      );

      expect(result.filesRemoved).toEqual([]);
      expect(result.directoriesRemoved).toEqual([]);
    });
  });

  describe('combined options', () => {
    it('handles force + directories + ignored together', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClean(
        { force: true, directories: true, ignored: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-f');
      expect(args).toContain('-d');
      expect(args).toContain('-x');
    });
  });

  describe('error handling', () => {
    it('throws mapped git error on failure', async () => {
      mockExecGit.mockRejectedValueOnce(
        new Error('fatal: clean.requireForce defaults to true'),
      );

      await expect(
        executeClean({ force: false }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });
});
