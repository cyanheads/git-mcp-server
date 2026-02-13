/**
 * @fileoverview Unit tests for git init operation
 * @module tests/services/git/providers/cli/operations/core/init.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeInit } from '@/services/git/providers/cli/operations/core/init.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeInit', () => {
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

  describe('default options', () => {
    it('initializes with default branch main', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeInit(
        { path: '/new/repo' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.path).toBe('/new/repo');
      expect(result.initialBranch).toBe('main');
      expect(result.bare).toBe(false);
    });

    it('passes correct args to execGit for default init', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeInit({ path: '/new/repo' }, mockContext, mockExecGit);

      const [args, cwd] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('init');
      expect(args).toContain('--initial-branch=main');
      expect(args).toContain('/new/repo');
      expect(cwd).toBe('/test/repo');
    });
  });

  describe('custom initial branch', () => {
    it('uses the provided initial branch name', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeInit(
        { path: '/new/repo', initialBranch: 'develop' },
        mockContext,
        mockExecGit,
      );

      expect(result.initialBranch).toBe('develop');

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--initial-branch=develop');
    });
  });

  describe('bare repository', () => {
    it('passes --bare flag when bare is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeInit(
        { path: '/new/repo', bare: true },
        mockContext,
        mockExecGit,
      );

      expect(result.bare).toBe(true);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--bare');
    });

    it('does not pass --bare flag when bare is false', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeInit(
        { path: '/new/repo', bare: false },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--bare');
    });

    it('places --bare before --initial-branch', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeInit(
        { path: '/new/repo', bare: true, initialBranch: 'trunk' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      const bareIdx = args.indexOf('--bare');
      const branchIdx = args.findIndex((a: string) =>
        a.startsWith('--initial-branch='),
      );
      expect(bareIdx).toBeLessThan(branchIdx);
    });
  });

  describe('error handling', () => {
    it('throws mapped git error on failure', async () => {
      mockExecGit.mockRejectedValueOnce(new Error('git init failed'));

      await expect(
        executeInit({ path: '/new/repo' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });
});
