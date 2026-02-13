/**
 * @fileoverview Unit tests for git rebase operation
 * @module tests/services/git/providers/cli/operations/branches/rebase.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeRebase } from '@/services/git/providers/cli/operations/branches/rebase.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeRebase', () => {
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

  describe('start mode', () => {
    it('starts a rebase onto upstream', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout:
          'Successfully rebased and updated refs/heads/feature.\n3 commits applied',
        stderr: '',
      });

      const result = await executeRebase(
        { mode: 'start', upstream: 'main' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('rebase');
      expect(args).toContain('main');
      expect(result.success).toBe(true);
      expect(result.conflicts).toBe(false);
      expect(result.conflictedFiles).toEqual([]);
      expect(result.rebasedCommits).toBe(3);
    });

    it('starts rebase with branch argument', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeRebase(
        { mode: 'start', upstream: 'main', branch: 'feature' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('main');
      expect(args).toContain('feature');
    });

    it('starts rebase with --onto option', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeRebase(
        { mode: 'start', upstream: 'main', onto: 'develop' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--onto');
      expect(args).toContain('develop');
      expect(args).toContain('main');
    });

    it('starts rebase with --onto and branch', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeRebase(
        { mode: 'start', upstream: 'main', onto: 'develop', branch: 'feature' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--onto');
      expect(args).toContain('develop');
      expect(args).toContain('main');
      expect(args).toContain('feature');
    });

    it('adds --interactive flag when interactive is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeRebase(
        { mode: 'start', upstream: 'main', interactive: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--interactive');
    });

    it('adds --preserve-merges flag when preserve is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeRebase(
        { mode: 'start', upstream: 'main', preserve: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--preserve-merges');
    });

    it('throws when upstream is missing in start mode', async () => {
      await expect(
        executeRebase({ mode: 'start' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });

    it('defaults to start mode when mode is not specified', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeRebase({ upstream: 'main' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('rebase');
      expect(args).toContain('main');
    });
  });

  describe('continue mode', () => {
    it('continues a rebase with --continue --no-edit', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeRebase(
        { mode: 'continue' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('rebase');
      expect(args).toContain('--continue');
      expect(args).toContain('--no-edit');
      expect(result.success).toBe(true);
      expect(result.conflicts).toBe(false);
      expect(result.rebasedCommits).toBe(1);
    });

    it('falls back to --continue without --no-edit on older git', async () => {
      mockExecGit
        .mockRejectedValueOnce(new Error("unknown option `no-edit'"))
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeRebase(
        { mode: 'continue' },
        mockContext,
        mockExecGit,
      );

      expect(mockExecGit).toHaveBeenCalledTimes(2);
      const [secondArgs] = mockExecGit.mock.calls[1]!;
      expect(secondArgs).toContain('--continue');
      expect(secondArgs).not.toContain('--no-edit');
      expect(result.success).toBe(true);
    });
  });

  describe('abort mode', () => {
    it('aborts a rebase with --abort', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeRebase(
        { mode: 'abort' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('rebase');
      expect(args).toContain('--abort');
      expect(result.success).toBe(true);
      expect(result.conflicts).toBe(false);
    });
  });

  describe('skip mode', () => {
    it('skips a commit with --skip', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeRebase(
        { mode: 'skip' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('rebase');
      expect(args).toContain('--skip');
      expect(result.success).toBe(true);
    });
  });

  describe('rebase with conflicts', () => {
    it('detects conflicts in stdout', async () => {
      const conflictOutput = `Applying: Add feature
CONFLICT (content): Merge conflict in file1.txt
CONFLICT (content): Merge conflict in file2.txt
error: could not apply abc123`;

      mockExecGit.mockResolvedValueOnce({
        stdout: conflictOutput,
        stderr: '',
      });

      const result = await executeRebase(
        { mode: 'start', upstream: 'main' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(false);
      expect(result.conflicts).toBe(true);
      expect(result.conflictedFiles).toContain('file1.txt');
      expect(result.conflictedFiles).toContain('file2.txt');
      expect(result.conflictedFiles).toHaveLength(2);
    });

    it('detects conflicts in stderr', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: 'CONFLICT (content): Merge conflict in app.ts',
      });

      const result = await executeRebase(
        { mode: 'start', upstream: 'main' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(false);
      expect(result.conflicts).toBe(true);
    });
  });

  describe('commit count parsing', () => {
    it('parses number of rebased commits from output', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout:
          'Successfully rebased and updated refs/heads/feature.\n5 commits applied',
        stderr: '',
      });

      const result = await executeRebase(
        { mode: 'start', upstream: 'main' },
        mockContext,
        mockExecGit,
      );

      expect(result.rebasedCommits).toBe(5);
    });

    it('returns 0 rebased commits when no match found', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Successfully rebased.',
        stderr: '',
      });

      const result = await executeRebase(
        { mode: 'start', upstream: 'main' },
        mockContext,
        mockExecGit,
      );

      expect(result.rebasedCommits).toBe(0);
    });
  });

  describe('error handling', () => {
    it('throws mapped error when git command fails', async () => {
      mockExecGit.mockRejectedValueOnce(
        new Error('fatal: no rebase in progress'),
      );

      await expect(
        executeRebase({ mode: 'abort' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });
});
