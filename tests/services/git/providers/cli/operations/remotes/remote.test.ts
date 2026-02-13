/**
 * @fileoverview Unit tests for git remote operation
 * @module tests/services/git/providers/cli/operations/remotes/remote.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeRemote } from '@/services/git/providers/cli/operations/remotes/remote.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeRemote', () => {
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
    it('lists remotes with parsed fetch and push URLs', async () => {
      const remoteOutput = `origin\thttps://github.com/user/repo.git (fetch)
origin\thttps://github.com/user/repo.git (push)
upstream\thttps://github.com/org/repo.git (fetch)
upstream\thttps://github.com/org/repo.git (push)`;

      mockExecGit.mockResolvedValueOnce({ stdout: remoteOutput, stderr: '' });

      const result = await executeRemote(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result.mode).toBe('list');
      expect(result.remotes).toHaveLength(2);
      expect(result.remotes![0]).toEqual({
        name: 'origin',
        fetchUrl: 'https://github.com/user/repo.git',
        pushUrl: 'https://github.com/user/repo.git',
      });
      expect(result.remotes![1]).toEqual({
        name: 'upstream',
        fetchUrl: 'https://github.com/org/repo.git',
        pushUrl: 'https://github.com/org/repo.git',
      });
    });

    it('uses -v flag for listing', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeRemote({ mode: 'list' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('remote');
      expect(args).toContain('-v');
    });

    it('returns empty array when no remotes configured', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeRemote(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result.remotes).toEqual([]);
    });

    it('handles different fetch and push URLs', async () => {
      const remoteOutput = `origin\thttps://github.com/user/repo.git (fetch)
origin\tgit@github.com:user/repo.git (push)`;

      mockExecGit.mockResolvedValueOnce({ stdout: remoteOutput, stderr: '' });

      const result = await executeRemote(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result.remotes).toHaveLength(1);
      expect(result.remotes![0]!.fetchUrl).toBe(
        'https://github.com/user/repo.git',
      );
      expect(result.remotes![0]!.pushUrl).toBe('git@github.com:user/repo.git');
    });
  });

  describe('add mode', () => {
    it('adds a new remote', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeRemote(
        {
          mode: 'add',
          name: 'upstream',
          url: 'https://github.com/org/repo.git',
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('remote');
      expect(args).toContain('add');
      expect(args).toContain('upstream');
      expect(args).toContain('https://github.com/org/repo.git');
      expect(result.mode).toBe('add');
      expect(result.added).toEqual({
        name: 'upstream',
        url: 'https://github.com/org/repo.git',
      });
    });

    it('throws when name is missing', async () => {
      await expect(
        executeRemote(
          { mode: 'add', url: 'https://github.com/org/repo.git' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });

    it('throws when url is missing', async () => {
      await expect(
        executeRemote(
          { mode: 'add', name: 'upstream' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });
  });

  describe('remove mode', () => {
    it('removes a remote', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeRemote(
        { mode: 'remove', name: 'upstream' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('remote');
      expect(args).toContain('remove');
      expect(args).toContain('upstream');
      expect(result.mode).toBe('remove');
      expect(result.removed).toBe('upstream');
    });

    it('throws when name is missing', async () => {
      await expect(
        executeRemote({ mode: 'remove' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });

  describe('rename mode', () => {
    it('renames a remote', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeRemote(
        { mode: 'rename', name: 'origin', newName: 'upstream' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('remote');
      expect(args).toContain('rename');
      expect(args).toContain('origin');
      expect(args).toContain('upstream');
      expect(result.mode).toBe('rename');
      expect(result.renamed).toEqual({ from: 'origin', to: 'upstream' });
    });

    it('throws when name is missing', async () => {
      await expect(
        executeRemote(
          { mode: 'rename', newName: 'upstream' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });

    it('throws when newName is missing', async () => {
      await expect(
        executeRemote(
          { mode: 'rename', name: 'origin' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });
  });

  describe('get-url mode', () => {
    it('gets the fetch URL for a remote', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'https://github.com/user/repo.git\n',
        stderr: '',
      });

      const result = await executeRemote(
        { mode: 'get-url', name: 'origin' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('remote');
      expect(args).toContain('get-url');
      expect(args).toContain('origin');
      expect(result.mode).toBe('get-url');
      expect(result.remotes).toHaveLength(1);
      expect(result.remotes![0]!.fetchUrl).toBe(
        'https://github.com/user/repo.git',
      );
    });

    it('adds --push flag when push option is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'git@github.com:user/repo.git\n',
        stderr: '',
      });

      await executeRemote(
        { mode: 'get-url', name: 'origin', push: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--push');
    });

    it('throws when name is missing', async () => {
      await expect(
        executeRemote({ mode: 'get-url' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });

  describe('set-url mode', () => {
    it('sets the URL for a remote', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeRemote(
        {
          mode: 'set-url',
          name: 'origin',
          url: 'https://github.com/new/repo.git',
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('remote');
      expect(args).toContain('set-url');
      expect(args).toContain('origin');
      expect(args).toContain('https://github.com/new/repo.git');
      expect(result.mode).toBe('set-url');
    });

    it('adds --push flag when push option is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeRemote(
        {
          mode: 'set-url',
          name: 'origin',
          url: 'git@github.com:user/repo.git',
          push: true,
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--push');
    });

    it('throws when name is missing', async () => {
      await expect(
        executeRemote(
          { mode: 'set-url', url: 'https://github.com/repo.git' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });

    it('throws when url is missing', async () => {
      await expect(
        executeRemote(
          { mode: 'set-url', name: 'origin' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('throws mapped error when git command fails', async () => {
      mockExecGit.mockRejectedValueOnce(
        new Error("fatal: No such remote: 'nonexistent'"),
      );

      await expect(
        executeRemote(
          { mode: 'remove', name: 'nonexistent' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });
  });
});
