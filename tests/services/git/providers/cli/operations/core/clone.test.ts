/**
 * @fileoverview Unit tests for git clone operation
 * @module tests/services/git/providers/cli/operations/core/clone.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeClone } from '@/services/git/providers/cli/operations/core/clone.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeClone', () => {
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

  describe('basic clone', () => {
    it('clones a repository with url and local path', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeClone(
        {
          remoteUrl: 'https://github.com/user/repo.git',
          localPath: '/clone/target',
        },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.localPath).toBe('/clone/target');
      expect(result.remoteUrl).toBe('https://github.com/user/repo.git');
      expect(result.branch).toBe('main');
    });

    it('passes url and path as args to execGit', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClone(
        {
          remoteUrl: 'https://github.com/user/repo.git',
          localPath: '/clone/target',
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('clone');
      expect(args).toContain('https://github.com/user/repo.git');
      expect(args).toContain('/clone/target');
    });
  });

  describe('branch option', () => {
    it('adds --branch flag when branch is specified', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeClone(
        {
          remoteUrl: 'https://github.com/user/repo.git',
          localPath: '/clone/target',
          branch: 'develop',
        },
        mockContext,
        mockExecGit,
      );

      expect(result.branch).toBe('develop');

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--branch');
      expect(args).toContain('develop');
    });

    it('defaults branch to main when not specified', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeClone(
        {
          remoteUrl: 'https://github.com/user/repo.git',
          localPath: '/clone/target',
        },
        mockContext,
        mockExecGit,
      );

      expect(result.branch).toBe('main');
    });
  });

  describe('depth option', () => {
    it('adds --depth flag for shallow clone', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClone(
        {
          remoteUrl: 'https://github.com/user/repo.git',
          localPath: '/clone/target',
          depth: 1,
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--depth');
      expect(args).toContain('1');
    });

    it('converts depth number to string', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClone(
        {
          remoteUrl: 'https://github.com/user/repo.git',
          localPath: '/clone/target',
          depth: 10,
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('10');
    });
  });

  describe('bare clone', () => {
    it('adds --bare flag when bare is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClone(
        {
          remoteUrl: 'https://github.com/user/repo.git',
          localPath: '/clone/target',
          bare: true,
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--bare');
    });
  });

  describe('mirror clone', () => {
    it('adds --mirror flag when mirror is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClone(
        {
          remoteUrl: 'https://github.com/user/repo.git',
          localPath: '/clone/target',
          mirror: true,
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--mirror');
    });
  });

  describe('recurse submodules', () => {
    it('adds --recurse-submodules flag when enabled', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClone(
        {
          remoteUrl: 'https://github.com/user/repo.git',
          localPath: '/clone/target',
          recurseSubmodules: true,
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--recurse-submodules');
    });
  });

  describe('combined options', () => {
    it('handles branch + depth together', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClone(
        {
          remoteUrl: 'https://github.com/user/repo.git',
          localPath: '/clone/target',
          branch: 'feature',
          depth: 5,
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--branch');
      expect(args).toContain('feature');
      expect(args).toContain('--depth');
      expect(args).toContain('5');
    });
  });

  describe('error handling', () => {
    it('throws mapped git error on failure', async () => {
      mockExecGit.mockRejectedValueOnce(
        new Error('fatal: repository not found'),
      );

      await expect(
        executeClone(
          {
            remoteUrl: 'https://github.com/user/nonexistent.git',
            localPath: '/clone/target',
          },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });
  });
});
