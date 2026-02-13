/**
 * @fileoverview Unit tests for git branch operation
 * @module tests/services/git/providers/cli/operations/branches/branch.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeBranch } from '@/services/git/providers/cli/operations/branches/branch.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

const FIELD_DELIMITER = '\x1F';

describe('executeBranch', () => {
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

  describe('list mode', () => {
    it('lists local branches using for-each-ref', async () => {
      const output = [
        `refs/heads/main${FIELD_DELIMITER}abc123${FIELD_DELIMITER}origin/main${FIELD_DELIMITER}${FIELD_DELIMITER}*`,
        `refs/heads/develop${FIELD_DELIMITER}def456${FIELD_DELIMITER}origin/develop${FIELD_DELIMITER}[ahead 2]${FIELD_DELIMITER} `,
      ].join('\n');

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeBranch(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result.mode).toBe('list');
      if (result.mode === 'list') {
        expect(result.branches).toHaveLength(2);
        expect(result.branches[0]!.name).toBe('main');
        expect(result.branches[0]!.commitHash).toBe('abc123');
        expect(result.branches[0]!.current).toBe(true);
        expect(result.branches[0]!.upstream).toBe('origin/main');
        expect(result.branches[1]!.name).toBe('develop');
        expect(result.branches[1]!.commitHash).toBe('def456');
        expect(result.branches[1]!.current).toBe(false);
        expect(result.branches[1]!.ahead).toBe(2);
      }
    });

    it('uses for-each-ref command with refs/heads prefix', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeBranch({ mode: 'list' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('for-each-ref');
      expect(args).toContain('refs/heads');
    });

    it('uses refs/remotes prefix when remote option is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeBranch(
        { mode: 'list', remote: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('refs/remotes');
    });

    it('returns empty branches array for empty output', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeBranch(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      if (result.mode === 'list') {
        expect(result.branches).toEqual([]);
      }
    });

    it('adds --merged filter when merged option is set', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeBranch(
        { mode: 'list', merged: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--merged=HEAD');
    });

    it('adds --merged with custom ref when merged is a string', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeBranch(
        { mode: 'list', merged: 'develop' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--merged=develop');
    });

    it('adds --no-merged filter when noMerged option is set', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeBranch(
        { mode: 'list', noMerged: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--no-merged=HEAD');
    });
  });

  describe('create mode', () => {
    it('creates a new branch', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeBranch(
        { mode: 'create', branchName: 'feature-x' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('branch');
      expect(args).toContain('feature-x');
      expect(result.mode).toBe('create');
      if (result.mode === 'create') {
        expect(result.created).toBe('feature-x');
      }
    });

    it('creates branch from a specific start point', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeBranch(
        { mode: 'create', branchName: 'feature-x', startPoint: 'abc123' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('feature-x');
      expect(args).toContain('abc123');
    });

    it('adds --force flag when force is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeBranch(
        { mode: 'create', branchName: 'feature-x', force: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--force');
    });

    it('throws when branch name is missing', async () => {
      await expect(
        executeBranch({ mode: 'create' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });

  describe('delete mode', () => {
    it('deletes a branch with -d flag', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeBranch(
        { mode: 'delete', branchName: 'old-branch' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('branch');
      expect(args).toContain('-d');
      expect(args).toContain('old-branch');
      expect(result.mode).toBe('delete');
      if (result.mode === 'delete') {
        expect(result.deleted).toBe('old-branch');
      }
    });

    it('uses -D flag for force delete', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeBranch(
        { mode: 'delete', branchName: 'old-branch', force: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-D');
      expect(args).not.toContain('-d');
    });

    it('throws when branch name is missing', async () => {
      await expect(
        executeBranch({ mode: 'delete' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });

  describe('rename mode', () => {
    it('renames a branch with -m flag', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeBranch(
        { mode: 'rename', branchName: 'old-name', newBranchName: 'new-name' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('branch');
      expect(args).toContain('-m');
      expect(args).toContain('old-name');
      expect(args).toContain('new-name');
      expect(result.mode).toBe('rename');
      if (result.mode === 'rename') {
        expect(result.renamed).toEqual({ from: 'old-name', to: 'new-name' });
      }
    });

    it('adds --force flag when force is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeBranch(
        {
          mode: 'rename',
          branchName: 'old-name',
          newBranchName: 'new-name',
          force: true,
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--force');
    });

    it('throws when branch name is missing', async () => {
      await expect(
        executeBranch(
          { mode: 'rename', newBranchName: 'new-name' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });

    it('throws when new branch name is missing', async () => {
      await expect(
        executeBranch(
          { mode: 'rename', branchName: 'old-name' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('throws mapped error when git command fails', async () => {
      mockExecGit.mockRejectedValueOnce(
        new Error('fatal: not a valid branch name'),
      );

      await expect(
        executeBranch(
          { mode: 'create', branchName: 'bad//name' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });
  });
});
