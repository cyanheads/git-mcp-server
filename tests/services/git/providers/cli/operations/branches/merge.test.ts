/**
 * @fileoverview Unit tests for git merge operation
 * @module tests/services/git/providers/cli/operations/branches/merge.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeMerge } from '@/services/git/providers/cli/operations/branches/merge.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeMerge', () => {
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

  describe('clean merge', () => {
    it('merges a branch successfully', async () => {
      const mergeOutput = `Updating abc123..def456
Merge made by the 'ort' strategy.
 file1.txt | 2 ++
 1 file changed, 2 insertions(+)`;

      mockExecGit.mockResolvedValueOnce({ stdout: mergeOutput, stderr: '' });

      const result = await executeMerge(
        { branch: 'feature' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.conflicts).toBe(false);
      expect(result.conflictedFiles).toEqual([]);
      expect(result.fastForward).toBe(false);
    });

    it('passes branch name to git merge', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeMerge({ branch: 'feature-x' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('merge');
      expect(args).toContain('feature-x');
    });
  });

  describe('fast-forward merge', () => {
    it('detects fast-forward merge', async () => {
      const ffOutput = `Updating abc123..def456
Fast-forward
 file1.txt | 1 +
 1 file changed, 1 insertion(+)`;

      mockExecGit.mockResolvedValueOnce({ stdout: ffOutput, stderr: '' });

      const result = await executeMerge(
        { branch: 'feature' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.fastForward).toBe(true);
      expect(result.conflicts).toBe(false);
    });
  });

  describe('merge with conflicts', () => {
    it('detects conflicts in stdout', async () => {
      const conflictOutput = `Auto-merging file1.txt
CONFLICT (content): Merge conflict in file1.txt
CONFLICT (content): Merge conflict in file2.txt
Automatic merge failed; fix conflicts and then commit the result.`;

      mockExecGit.mockResolvedValueOnce({
        stdout: conflictOutput,
        stderr: '',
      });

      const result = await executeMerge(
        { branch: 'feature' },
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

      const result = await executeMerge(
        { branch: 'feature' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(false);
      expect(result.conflicts).toBe(true);
    });
  });

  describe('noFastForward option', () => {
    it('adds --no-ff flag when noFastForward is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeMerge(
        { branch: 'feature', noFastForward: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--no-ff');
    });

    it('does not add --no-ff when noFastForward is falsy', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeMerge({ branch: 'feature' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--no-ff');
    });
  });

  describe('strategy option', () => {
    it('adds --strategy flag with specified strategy', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeMerge(
        { branch: 'feature', strategy: 'ours' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--strategy=ours');
    });

    it('returns specified strategy in result', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeMerge(
        { branch: 'feature', strategy: 'recursive' },
        mockContext,
        mockExecGit,
      );

      expect(result.strategy).toBe('recursive');
    });

    it('defaults strategy to ort when not specified', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeMerge(
        { branch: 'feature' },
        mockContext,
        mockExecGit,
      );

      expect(result.strategy).toBe('ort');
    });
  });

  describe('squash option', () => {
    it('adds --squash flag when squash is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeMerge(
        { branch: 'feature', squash: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--squash');
    });
  });

  describe('message option', () => {
    it('adds -m flag with custom message', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeMerge(
        { branch: 'feature', message: 'Merge feature branch' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-m');
      expect(args).toContain('Merge feature branch');
    });

    it('returns custom message in result', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: 'some output', stderr: '' });

      const result = await executeMerge(
        { branch: 'feature', message: 'Custom merge message' },
        mockContext,
        mockExecGit,
      );

      expect(result.message).toBe('Custom merge message');
    });

    it('returns stdout as message when no custom message provided', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Already up to date.',
        stderr: '',
      });

      const result = await executeMerge(
        { branch: 'feature' },
        mockContext,
        mockExecGit,
      );

      expect(result.message).toBe('Already up to date.');
    });
  });

  describe('combined options', () => {
    it('handles noFastForward + squash + message', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeMerge(
        {
          branch: 'feature',
          noFastForward: true,
          squash: true,
          message: 'Squash merge',
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--no-ff');
      expect(args).toContain('--squash');
      expect(args).toContain('-m');
      expect(args).toContain('Squash merge');
    });
  });

  describe('merged files parsing', () => {
    it('parses merged files from non-conflict lines', async () => {
      const output = `Updating abc123..def456
Merge made by the 'ort' strategy.
 file1.txt | 2 ++
 1 file changed, 2 insertions(+)`;

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeMerge(
        { branch: 'feature' },
        mockContext,
        mockExecGit,
      );

      expect(result.mergedFiles.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('throws mapped error when git command fails', async () => {
      mockExecGit.mockRejectedValueOnce(
        new Error('fatal: not something we can merge'),
      );

      await expect(
        executeMerge({ branch: 'nonexistent' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });
});
