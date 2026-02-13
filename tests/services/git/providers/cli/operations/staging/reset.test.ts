/**
 * @fileoverview Unit tests for git reset operation
 * @module tests/services/git/providers/cli/operations/staging/reset.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeReset } from '@/services/git/providers/cli/operations/staging/reset.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeReset', () => {
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

  describe('soft reset', () => {
    it('passes --soft flag', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // reset
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }); // rev-parse HEAD

      const result = await executeReset(
        { mode: 'soft' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('soft');
      expect(result.commit).toBe('abc123');

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('reset');
      expect(args).toContain('--soft');
    });
  });

  describe('mixed reset', () => {
    it('passes --mixed flag', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'def456\n', stderr: '' });

      const result = await executeReset(
        { mode: 'mixed' },
        mockContext,
        mockExecGit,
      );

      expect(result.mode).toBe('mixed');

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--mixed');
    });
  });

  describe('hard reset', () => {
    it('passes --hard flag', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '789abc\n', stderr: '' });

      const result = await executeReset(
        { mode: 'hard' },
        mockContext,
        mockExecGit,
      );

      expect(result.mode).toBe('hard');

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--hard');
    });
  });

  describe('with commit ref', () => {
    it('includes commit ref in args', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });

      await executeReset(
        { mode: 'soft', commit: 'HEAD~3' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('HEAD~3');
    });

    it('places mode flag before commit ref', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });

      await executeReset(
        { mode: 'hard', commit: 'abc123' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      const modeIdx = args.indexOf('--hard');
      const commitIdx = args.indexOf('abc123');
      expect(modeIdx).toBeLessThan(commitIdx);
    });
  });

  describe('with paths', () => {
    it('includes paths after -- separator', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });

      const result = await executeReset(
        { mode: 'mixed', paths: ['src/index.ts', 'src/utils.ts'] },
        mockContext,
        mockExecGit,
      );

      expect(result.filesReset).toEqual(['src/index.ts', 'src/utils.ts']);

      const [args] = mockExecGit.mock.calls[0]!;
      const dashDashIdx = args.indexOf('--');
      expect(dashDashIdx).toBeGreaterThan(-1);
      expect(args[dashDashIdx + 1]).toBe('src/index.ts');
      expect(args[dashDashIdx + 2]).toBe('src/utils.ts');
    });

    it('returns empty filesReset when no paths provided', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });

      const result = await executeReset(
        { mode: 'soft' },
        mockContext,
        mockExecGit,
      );

      expect(result.filesReset).toEqual([]);
    });
  });

  describe('rev-parse after reset', () => {
    it('calls rev-parse HEAD to get current commit hash', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({
          stdout: 'deadbeefcafebabe1234567890abcdef12345678\n',
          stderr: '',
        });

      const result = await executeReset(
        { mode: 'mixed' },
        mockContext,
        mockExecGit,
      );

      expect(result.commit).toBe('deadbeefcafebabe1234567890abcdef12345678');

      // Second call should be rev-parse HEAD
      const [revParseArgs] = mockExecGit.mock.calls[1]!;
      expect(revParseArgs).toContain('rev-parse');
      expect(revParseArgs).toContain('HEAD');
    });

    it('trims whitespace from commit hash', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '  abc123  \n', stderr: '' });

      const result = await executeReset(
        { mode: 'soft' },
        mockContext,
        mockExecGit,
      );

      expect(result.commit).toBe('abc123');
    });
  });

  describe('combined options', () => {
    it('handles mode + commit + paths together', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });

      const result = await executeReset(
        {
          mode: 'mixed',
          commit: 'HEAD~1',
          paths: ['file.ts'],
        },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('mixed');
      expect(result.filesReset).toEqual(['file.ts']);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--mixed');
      expect(args).toContain('HEAD~1');
      expect(args).toContain('--');
      expect(args).toContain('file.ts');
    });
  });

  describe('error handling', () => {
    it('throws mapped git error on failure', async () => {
      mockExecGit.mockRejectedValueOnce(new Error('fatal: ambiguous argument'));

      await expect(
        executeReset(
          { mode: 'hard', commit: 'nonexistent' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });
  });
});
