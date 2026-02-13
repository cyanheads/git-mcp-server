/**
 * @fileoverview Unit tests for git stash operation
 * @module tests/services/git/providers/cli/operations/stash/stash.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeStash } from '@/services/git/providers/cli/operations/stash/stash.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeStash', () => {
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
    it('lists stashes with stash list command', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: `stash@{0}: WIP on main: abc123 initial commit
stash@{1}: On feature: work in progress\n`,
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('stash');
      expect(args).toContain('list');
      expect(result.mode).toBe('list');
      expect(result.stashes).toHaveLength(2);
      expect(result.stashes![0]!.ref).toBe('stash@{0}');
      expect(result.stashes![0]!.description).toBe(
        'WIP on main: abc123 initial commit',
      );
      expect(result.stashes![1]!.ref).toBe('stash@{1}');
    });

    it('returns empty stashes for empty list', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result.stashes).toHaveLength(0);
    });
  });

  describe('push mode', () => {
    it('pushes stash with default options', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Saved working directory and index state WIP on main: abc123\n',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'push' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('stash');
      expect(args).toContain('push');
      expect(result.mode).toBe('push');
      expect(result.created).toBe('stash@{0}');
    });

    it('pushes stash with custom message', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeStash(
        { mode: 'push', message: 'save my work' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-m');
      expect(args).toContain('save my work');
    });

    it('includes untracked files when includeUntracked is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeStash(
        { mode: 'push', includeUntracked: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--include-untracked');
    });

    it('keeps index when keepIndex is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeStash(
        { mode: 'push', keepIndex: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--keep-index');
    });

    it('combines message, includeUntracked, and keepIndex', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeStash(
        {
          mode: 'push',
          message: 'wip',
          includeUntracked: true,
          keepIndex: true,
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-m');
      expect(args).toContain('wip');
      expect(args).toContain('--include-untracked');
      expect(args).toContain('--keep-index');
    });
  });

  describe('pop mode', () => {
    it('pops the latest stash by default', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout:
          'On branch main\nChanges not staged for commit:\n  modified: file.txt\n',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'pop' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('stash');
      expect(args).toContain('pop');
      expect(result.mode).toBe('pop');
      expect(result.applied).toBe('stash@{0}');
      expect(result.conflicts).toBe(false);
    });

    it('pops a specific stash ref', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'pop', stashRef: 'stash@{2}' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('stash@{2}');
      expect(result.applied).toBe('stash@{2}');
    });

    it('detects conflicts during pop', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'CONFLICT (content): Merge conflict in file.txt\n',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'pop' },
        mockContext,
        mockExecGit,
      );

      expect(result.conflicts).toBe(true);
    });
  });

  describe('apply mode', () => {
    it('applies the latest stash by default', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'On branch main\n',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'apply' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('stash');
      expect(args).toContain('apply');
      expect(result.mode).toBe('apply');
      expect(result.applied).toBe('stash@{0}');
    });

    it('applies a specific stash ref', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'apply', stashRef: 'stash@{1}' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('stash@{1}');
      expect(result.applied).toBe('stash@{1}');
    });

    it('detects conflicts in stderr during apply', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: 'CONFLICT (content): Merge conflict in file.txt\n',
      });

      const result = await executeStash(
        { mode: 'apply' },
        mockContext,
        mockExecGit,
      );

      expect(result.conflicts).toBe(true);
    });
  });

  describe('drop mode', () => {
    it('drops a specific stash ref', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Dropped stash@{0} (abc123)\n',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'drop', stashRef: 'stash@{0}' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('stash');
      expect(args).toContain('drop');
      expect(args).toContain('stash@{0}');
      expect(result.mode).toBe('drop');
      expect(result.dropped).toBe('stash@{0}');
    });

    it('throws error when stashRef is missing for drop', async () => {
      await expect(
        executeStash({ mode: 'drop' } as any, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });

  describe('clear mode', () => {
    it('clears all stashes', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'clear' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('stash');
      expect(args).toContain('clear');
      expect(result.mode).toBe('clear');
    });
  });

  describe('result structure', () => {
    it('returns correct structure for list mode', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'stash@{0}: WIP on main: abc123 test\n',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result).toHaveProperty('mode', 'list');
      expect(result).toHaveProperty('stashes');
    });

    it('returns correct structure for push mode', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'push' },
        mockContext,
        mockExecGit,
      );

      expect(result).toHaveProperty('mode', 'push');
      expect(result).toHaveProperty('created', 'stash@{0}');
    });

    it('returns correct structure for clear mode', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeStash(
        { mode: 'clear' },
        mockContext,
        mockExecGit,
      );

      expect(result).toHaveProperty('mode', 'clear');
    });
  });
});
