/**
 * @fileoverview Unit tests for git status operation
 * @module tests/services/git/providers/cli/operations/core/status.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeStatus } from '@/services/git/providers/cli/operations/core/status.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeStatus', () => {
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

  describe('clean repository', () => {
    it('returns clean status with branch name', async () => {
      const porcelainOutput = '# branch.oid abc123def456\n# branch.head main';

      mockExecGit.mockResolvedValueOnce({
        stdout: porcelainOutput,
        stderr: '',
      });

      const result = await executeStatus({}, mockContext, mockExecGit);

      expect(result.currentBranch).toBe('main');
      expect(result.isClean).toBe(true);
      expect(result.untrackedFiles).toEqual([]);
      expect(result.conflictedFiles).toEqual([]);
    });

    it('passes --porcelain=v2 and -b flags', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '# branch.head main',
        stderr: '',
      });

      await executeStatus({}, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('status');
      expect(args).toContain('--porcelain=v2');
      expect(args).toContain('-b');
    });
  });

  describe('staged changes', () => {
    it('parses staged added files', async () => {
      const output = [
        '# branch.head main',
        '1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 abc123def456 new-file.txt',
      ].join('\n');

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeStatus({}, mockContext, mockExecGit);

      expect(result.isClean).toBe(false);
      expect(result.stagedChanges.added).toContain('new-file.txt');
    });

    it('parses staged modified files', async () => {
      const output = [
        '# branch.head main',
        '1 M. N... 100644 100644 100644 abc123def456 def789abc012 modified.ts',
      ].join('\n');

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeStatus({}, mockContext, mockExecGit);

      expect(result.isClean).toBe(false);
      expect(result.stagedChanges.modified).toContain('modified.ts');
    });

    it('parses staged deleted files', async () => {
      const output = [
        '# branch.head main',
        '1 D. N... 100644 000000 000000 abc123def456 0000000000000000000000000000000000000000 removed.txt',
      ].join('\n');

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeStatus({}, mockContext, mockExecGit);

      expect(result.isClean).toBe(false);
      expect(result.stagedChanges.deleted).toContain('removed.txt');
    });
  });

  describe('unstaged changes', () => {
    it('parses unstaged modified files', async () => {
      const output = [
        '# branch.head main',
        '1 .M N... 100644 100644 100644 abc123def456 abc123def456 changed.ts',
      ].join('\n');

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeStatus({}, mockContext, mockExecGit);

      expect(result.isClean).toBe(false);
      expect(result.unstagedChanges.modified).toContain('changed.ts');
    });

    it('parses unstaged deleted files', async () => {
      const output = [
        '# branch.head main',
        '1 .D N... 100644 100644 000000 abc123def456 abc123def456 deleted.ts',
      ].join('\n');

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeStatus({}, mockContext, mockExecGit);

      expect(result.isClean).toBe(false);
      expect(result.unstagedChanges.deleted).toContain('deleted.ts');
    });
  });

  describe('untracked files', () => {
    it('parses untracked files', async () => {
      const output = ['# branch.head main', '? new-untracked.txt'].join('\n');

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeStatus({}, mockContext, mockExecGit);

      expect(result.isClean).toBe(false);
      expect(result.untrackedFiles).toContain('new-untracked.txt');
    });

    it('excludes untracked files when includeUntracked is false', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '# branch.head main',
        stderr: '',
      });

      await executeStatus(
        { includeUntracked: false },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--untracked-files=no');
    });

    it('does not add --untracked-files=no by default', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '# branch.head main',
        stderr: '',
      });

      await executeStatus({}, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--untracked-files=no');
    });
  });

  describe('conflicted files', () => {
    it('parses unmerged (conflicted) entries', async () => {
      // porcelain v2 unmerged: u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <path>
      // parser uses parts.slice(8) for the path
      const output = [
        '# branch.head main',
        'u UU N... 100644 100644 100644 100644 abc123 conflict.txt',
      ].join('\n');

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeStatus({}, mockContext, mockExecGit);

      expect(result.isClean).toBe(false);
      expect(result.conflictedFiles).toContain('conflict.txt');
    });
  });

  describe('mixed status', () => {
    it('handles multiple changes of different types', async () => {
      const output = [
        '# branch.head feature-branch',
        '1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 abc123def456 added.ts',
        '1 .M N... 100644 100644 100644 abc123def456 abc123def456 unstaged-mod.ts',
        '? untracked.txt',
      ].join('\n');

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeStatus({}, mockContext, mockExecGit);

      expect(result.currentBranch).toBe('feature-branch');
      expect(result.isClean).toBe(false);
      expect(result.stagedChanges.added).toContain('added.ts');
      expect(result.unstagedChanges.modified).toContain('unstaged-mod.ts');
      expect(result.untrackedFiles).toContain('untracked.txt');
    });
  });

  describe('detached HEAD', () => {
    it('returns null branch for detached HEAD', async () => {
      const output = '# branch.head (detached)';

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeStatus({}, mockContext, mockExecGit);

      expect(result.currentBranch).toBeNull();
    });
  });

  describe('ignore submodules', () => {
    it('passes --ignore-submodules flag when enabled', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '# branch.head main',
        stderr: '',
      });

      await executeStatus({ ignoreSubmodules: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--ignore-submodules');
    });
  });

  describe('error handling', () => {
    it('throws mapped git error on failure', async () => {
      mockExecGit.mockRejectedValueOnce(
        new Error('fatal: not a git repository'),
      );

      await expect(
        executeStatus({}, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });
});
