/**
 * @fileoverview Unit tests for git worktree operation
 * @module tests/services/git/providers/cli/operations/worktree/worktree.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeWorktree } from '@/services/git/providers/cli/operations/worktree/worktree.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeWorktree', () => {
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
    it('lists worktrees in porcelain format', async () => {
      const porcelainOutput = `worktree /home/user/repo
HEAD abc123def456789012345678901234567890abcd
branch refs/heads/main

worktree /home/user/repo-feature
HEAD def456789012345678901234567890abcdef0123
branch refs/heads/feature
`;

      mockExecGit.mockResolvedValueOnce({
        stdout: porcelainOutput,
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('worktree');
      expect(args).toContain('list');
      expect(args).toContain('--porcelain');
      expect(result.mode).toBe('list');
      expect(result.worktrees).toHaveLength(2);
      expect(result.worktrees![0]!.path).toBe('/home/user/repo');
      expect(result.worktrees![0]!.head).toBe(
        'abc123def456789012345678901234567890abcd',
      );
      expect(result.worktrees![0]!.branch).toBe('refs/heads/main');
      expect(result.worktrees![1]!.path).toBe('/home/user/repo-feature');
      expect(result.worktrees![1]!.branch).toBe('refs/heads/feature');
    });

    it('parses detached worktree', async () => {
      const porcelainOutput = `worktree /home/user/repo
HEAD abc123def456789012345678901234567890abcd
branch refs/heads/main

worktree /home/user/repo-detached
HEAD def456789012345678901234567890abcdef0123
detached
`;

      mockExecGit.mockResolvedValueOnce({
        stdout: porcelainOutput,
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result.worktrees).toHaveLength(2);
      expect(result.worktrees![1]!.detached).toBe(true);
      expect(result.worktrees![1]!.branch).toBeUndefined();
    });

    it('parses bare worktree', async () => {
      const porcelainOutput = `worktree /home/user/repo.git
bare
`;

      mockExecGit.mockResolvedValueOnce({
        stdout: porcelainOutput,
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result.worktrees).toHaveLength(1);
      expect(result.worktrees![0]!.bare).toBe(true);
    });

    it('parses locked worktree', async () => {
      const porcelainOutput = `worktree /home/user/repo
HEAD abc123def456789012345678901234567890abcd
branch refs/heads/main

worktree /home/user/repo-locked
HEAD def456789012345678901234567890abcdef0123
branch refs/heads/feature
locked
`;

      mockExecGit.mockResolvedValueOnce({
        stdout: porcelainOutput,
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result.worktrees).toHaveLength(2);
      expect(result.worktrees![1]!.locked).toBe(true);
    });

    it('returns empty worktrees for empty output', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result.worktrees).toHaveLength(0);
    });
  });

  describe('add mode', () => {
    it('adds a worktree at specified path', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Preparing worktree (new branch)\n',
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'add', path: '/tmp/worktree' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('worktree');
      expect(args).toContain('add');
      expect(args).toContain('/tmp/worktree');
      expect(result.mode).toBe('add');
      expect(result.added).toBe('/tmp/worktree');
    });

    it('adds a worktree with commitish', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeWorktree(
        { mode: 'add', path: '/tmp/worktree', commitish: 'abc123' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('abc123');
    });

    it('adds a worktree with new branch', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeWorktree(
        { mode: 'add', path: '/tmp/worktree', branch: 'feature-x' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-b');
      expect(args).toContain('feature-x');
    });

    it('adds a detached worktree', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeWorktree(
        { mode: 'add', path: '/tmp/worktree', detach: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--detach');
    });

    it('adds a worktree with --force', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeWorktree(
        { mode: 'add', path: '/tmp/worktree', force: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--force');
    });

    it('throws error when path is missing for add', async () => {
      await expect(
        executeWorktree({ mode: 'add' } as any, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });

  describe('remove mode', () => {
    it('removes a worktree', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'remove', path: '/tmp/worktree' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('worktree');
      expect(args).toContain('remove');
      expect(args).toContain('/tmp/worktree');
      expect(result.mode).toBe('remove');
      expect(result.removed).toBe('/tmp/worktree');
    });

    it('removes a worktree with --force', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeWorktree(
        { mode: 'remove', path: '/tmp/worktree', force: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--force');
    });

    it('throws error when path is missing for remove', async () => {
      await expect(
        executeWorktree({ mode: 'remove' } as any, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });

  describe('move mode', () => {
    it('moves a worktree to a new path', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'move', path: '/tmp/old', newPath: '/tmp/new' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('worktree');
      expect(args).toContain('move');
      expect(args).toContain('/tmp/old');
      expect(args).toContain('/tmp/new');
      expect(result.mode).toBe('move');
      expect(result.moved).toEqual({ from: '/tmp/old', to: '/tmp/new' });
    });

    it('throws error when path or newPath is missing for move', async () => {
      await expect(
        executeWorktree(
          { mode: 'move', path: '/tmp/old' } as any,
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });
  });

  describe('prune mode', () => {
    it('prunes stale worktree info', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'prune' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('worktree');
      expect(args).toContain('prune');
      expect(result.mode).toBe('prune');
      expect(result.pruned).toEqual([]);
    });
  });

  describe('result structure', () => {
    it('returns correct structure for list mode', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result).toHaveProperty('mode', 'list');
      expect(result).toHaveProperty('worktrees');
    });

    it('returns correct structure for add mode', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeWorktree(
        { mode: 'add', path: '/tmp/wt' },
        mockContext,
        mockExecGit,
      );

      expect(result).toHaveProperty('mode', 'add');
      expect(result).toHaveProperty('added', '/tmp/wt');
    });
  });
});
