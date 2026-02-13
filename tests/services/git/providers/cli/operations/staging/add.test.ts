/**
 * @fileoverview Unit tests for git add operation
 * @module tests/services/git/providers/cli/operations/staging/add.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeAdd } from '@/services/git/providers/cli/operations/staging/add.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeAdd', () => {
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

  describe('add specific files', () => {
    it('stages specific files by path', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeAdd(
        { paths: ['src/index.ts', 'src/utils.ts'] },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.stagedFiles).toEqual(['src/index.ts', 'src/utils.ts']);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('add');
      expect(args).toContain('src/index.ts');
      expect(args).toContain('src/utils.ts');
    });

    it('stages a single file', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeAdd(
        { paths: ['README.md'] },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.stagedFiles).toEqual(['README.md']);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('README.md');
    });
  });

  describe('add all', () => {
    it('passes --all flag when all is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeAdd({ paths: [], all: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--all');
    });

    it('--all takes precedence over individual paths', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeAdd(
        { paths: ['file.ts'], all: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--all');
      // paths should not be added when --all is used
      expect(args).not.toContain('file.ts');
    });
  });

  describe('update mode', () => {
    it('passes --update flag when update is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeAdd({ paths: [], update: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--update');
    });

    it('--all takes precedence over --update', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeAdd(
        { paths: [], all: true, update: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--all');
      expect(args).not.toContain('--update');
    });
  });

  describe('force option', () => {
    it('passes --force flag when force is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeAdd(
        { paths: ['ignored-file.log'], force: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--force');
    });

    it('does not pass --force flag when force is false', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeAdd(
        { paths: ['file.ts'], force: false },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--force');
    });

    it('combines --force with --all', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeAdd(
        { paths: [], all: true, force: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--all');
      expect(args).toContain('--force');
    });
  });

  describe('empty paths', () => {
    it('handles empty paths array without all or update', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeAdd({ paths: [] }, mockContext, mockExecGit);

      expect(result.success).toBe(true);
      expect(result.stagedFiles).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('throws mapped git error on failure', async () => {
      mockExecGit.mockRejectedValueOnce(
        new Error('fatal: pathspec did not match any files'),
      );

      await expect(
        executeAdd({ paths: ['nonexistent.txt'] }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });
});
