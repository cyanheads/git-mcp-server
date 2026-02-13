/**
 * @fileoverview Unit tests for git fetch operation
 * @module tests/services/git/providers/cli/operations/remotes/fetch.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeFetch } from '@/services/git/providers/cli/operations/remotes/fetch.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeFetch', () => {
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

  describe('basic fetch', () => {
    it('fetches from origin by default', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeFetch({}, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('fetch');
      expect(args).toContain('origin');
      expect(result.success).toBe(true);
      expect(result.remote).toBe('origin');
      expect(result.fetchedRefs).toEqual([]);
      expect(result.prunedRefs).toEqual([]);
    });

    it('fetches from specified remote', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeFetch(
        { remote: 'upstream' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('upstream');
      expect(result.remote).toBe('upstream');
    });
  });

  describe('prune option', () => {
    it('adds --prune flag when prune is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeFetch({ prune: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--prune');
    });

    it('does not add --prune flag when prune is falsy', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeFetch({}, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--prune');
    });
  });

  describe('tags option', () => {
    it('adds --tags flag when tags is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeFetch({ tags: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--tags');
    });

    it('does not add --tags flag when tags is falsy', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeFetch({}, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--tags');
    });
  });

  describe('depth option', () => {
    it('adds --depth flag with specified value', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeFetch({ depth: 1 }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--depth=1');
    });

    it('supports arbitrary depth values', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeFetch({ depth: 50 }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--depth=50');
    });
  });

  describe('ref parsing from stderr', () => {
    it('parses new branch refs from stderr', async () => {
      const stderrOutput = `From https://github.com/user/repo
 * [new branch]      feature-a  -> origin/feature-a
 * [new branch]      feature-b  -> origin/feature-b`;

      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: stderrOutput,
      });

      const result = await executeFetch({}, mockContext, mockExecGit);

      expect(result.fetchedRefs).toContain('feature-a');
      expect(result.fetchedRefs).toContain('feature-b');
    });

    it('returns empty fetchedRefs when no new branches', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: 'From https://github.com/user/repo\n',
      });

      const result = await executeFetch({}, mockContext, mockExecGit);

      expect(result.fetchedRefs).toEqual([]);
    });
  });

  describe('combined options', () => {
    it('handles prune + tags + depth together', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeFetch(
        { prune: true, tags: true, depth: 10 },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--prune');
      expect(args).toContain('--tags');
      expect(args).toContain('--depth=10');
    });

    it('handles remote + prune together', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeFetch(
        { remote: 'upstream', prune: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('upstream');
      expect(args).toContain('--prune');
    });
  });

  describe('error handling', () => {
    it('throws mapped error when git command fails', async () => {
      mockExecGit.mockRejectedValueOnce(
        new Error(
          "fatal: 'nonexistent' does not appear to be a git repository",
        ),
      );

      await expect(
        executeFetch({ remote: 'nonexistent' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });
});
