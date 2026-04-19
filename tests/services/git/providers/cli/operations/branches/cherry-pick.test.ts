/**
 * @fileoverview Unit tests for git cherry-pick operation
 * @module tests/services/git/providers/cli/operations/branches/cherry-pick.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeCherryPick } from '@/services/git/providers/cli/operations/branches/cherry-pick.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
  options?: { allowNonZeroExit?: boolean },
) => Promise<{ stdout: string; stderr: string; exitCode?: number }>;

describe('executeCherryPick', () => {
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

  describe('pick single commit', () => {
    it('cherry-picks a single commit', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '[main abc123] Apply fix\n 1 file changed, 2 insertions(+)',
        stderr: '',
      });

      const result = await executeCherryPick(
        { commits: ['abc123'] },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('cherry-pick');
      expect(args).toContain('abc123');
      expect(result.success).toBe(true);
      expect(result.pickedCommits).toEqual(['abc123']);
      expect(result.conflicts).toBe(false);
      expect(result.conflictedFiles).toEqual([]);
    });
  });

  describe('pick multiple commits', () => {
    it('cherry-picks multiple commits', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Applied commits successfully',
        stderr: '',
      });

      const result = await executeCherryPick(
        { commits: ['abc123', 'def456', 'ghi789'] },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('abc123');
      expect(args).toContain('def456');
      expect(args).toContain('ghi789');
      expect(result.pickedCommits).toEqual(['abc123', 'def456', 'ghi789']);
    });
  });

  describe('noCommit option', () => {
    it('adds --no-commit flag when noCommit is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeCherryPick(
        { commits: ['abc123'], noCommit: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--no-commit');
    });

    it('does not add --no-commit when noCommit is falsy', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeCherryPick(
        { commits: ['abc123'] },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--no-commit');
    });
  });

  describe('argument ordering', () => {
    it('places flags before commit refs', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeCherryPick(
        {
          commits: ['abc123', 'def456'],
          noCommit: true,
          mainline: 1,
          strategy: 'ort',
          signoff: true,
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      const firstCommitIdx = args.indexOf('abc123');
      expect(firstCommitIdx).toBeGreaterThan(-1);
      // All flags must appear before the first commit ref
      expect(args.indexOf('--no-commit')).toBeLessThan(firstCommitIdx);
      expect(args.indexOf('--mainline')).toBeLessThan(firstCommitIdx);
      expect(args.indexOf('--strategy')).toBeLessThan(firstCommitIdx);
      expect(args.indexOf('--signoff')).toBeLessThan(firstCommitIdx);
      // Second commit ref should follow the first
      expect(args.indexOf('def456')).toBeGreaterThan(firstCommitIdx);
    });
  });

  describe('abort operation', () => {
    it('aborts cherry-pick with --abort', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeCherryPick(
        { commits: [], abort: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('cherry-pick');
      expect(args).toContain('--abort');
      expect(result.success).toBe(true);
      expect(result.pickedCommits).toEqual([]);
    });
  });

  describe('continue operation', () => {
    it('continues cherry-pick with --continue', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeCherryPick(
        { commits: [], continueOperation: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('cherry-pick');
      expect(args).toContain('--continue');
      expect(result.success).toBe(true);
      expect(result.pickedCommits).toEqual([]);
    });
  });

  describe('cherry-pick with conflicts', () => {
    it('returns structured conflict state from stdout (exit 1)', async () => {
      const conflictOutput = `Auto-merging file1.txt
CONFLICT (content): Merge conflict in file1.txt
CONFLICT (content): Merge conflict in file2.txt
error: could not apply abc123... Fix bug`;

      mockExecGit.mockResolvedValueOnce({
        stdout: conflictOutput,
        stderr: '',
        exitCode: 1,
      });

      const result = await executeCherryPick(
        { commits: ['abc123'] },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.conflicts).toBe(true);
      expect(result.conflictedFiles).toEqual(['file1.txt', 'file2.txt']);
    });

    it('detects conflicts in stderr', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: 'CONFLICT (content): Merge conflict in app.ts',
        exitCode: 1,
      });

      const result = await executeCherryPick(
        { commits: ['abc123'] },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.conflicts).toBe(true);
      expect(result.conflictedFiles).toEqual(['app.ts']);
    });

    it('passes allowNonZeroExit so cherry-pick can inspect output', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeCherryPick(
        { commits: ['abc123'] },
        mockContext,
        mockExecGit,
      );

      expect(mockExecGit.mock.calls[0]![3]).toEqual({ allowNonZeroExit: true });
    });

    it('throws on non-zero exit when no CONFLICT marker present', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: 'fatal: bad object abc123',
        exitCode: 128,
      });

      await expect(
        executeCherryPick({ commits: ['abc123'] }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });

  describe('abort takes priority over continue', () => {
    it('uses --abort when both abort and continueOperation are true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeCherryPick(
        { commits: ['abc123'], abort: true, continueOperation: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--abort');
      expect(args).not.toContain('--continue');
    });
  });

  describe('error handling', () => {
    it('throws mapped error when git command fails', async () => {
      mockExecGit.mockRejectedValueOnce(new Error('fatal: bad object abc123'));

      await expect(
        executeCherryPick({ commits: ['abc123'] }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });
});
