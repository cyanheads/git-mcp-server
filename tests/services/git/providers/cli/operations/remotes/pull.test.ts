/**
 * @fileoverview Unit tests for git pull operation
 * @module tests/services/git/providers/cli/operations/remotes/pull.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executePull } from '@/services/git/providers/cli/operations/remotes/pull.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executePull', () => {
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

  describe('basic pull operations', () => {
    it('pulls from default remote origin', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Already up to date.\n',
        stderr: '',
      });

      const result = await executePull({}, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('pull');
      expect(args).toContain('origin');
      expect(result.success).toBe(true);
      expect(result.remote).toBe('origin');
      expect(result.branch).toBe('HEAD');
    });

    it('pulls from specified remote', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Already up to date.\n',
        stderr: '',
      });

      const result = await executePull(
        { remote: 'upstream' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('upstream');
      expect(result.remote).toBe('upstream');
    });

    it('pulls specific branch', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Already up to date.\n',
        stderr: '',
      });

      const result = await executePull(
        { branch: 'develop' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('develop');
      expect(result.branch).toBe('develop');
    });
  });

  describe('rebase option', () => {
    it('adds --rebase flag when rebase is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Current branch main is up to date.\n',
        stderr: '',
      });

      const result = await executePull(
        { rebase: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--rebase');
      expect(result.strategy).toBe('rebase');
    });

    it('does not add --rebase when rebase is false', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Already up to date.\n',
        stderr: '',
      });

      await executePull({ rebase: false }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--rebase');
    });
  });

  describe('fast-forward only option', () => {
    it('adds --ff-only flag when fastForwardOnly is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Fast-forward\n file.txt | 1 +\n 1 file changed\n',
        stderr: '',
      });

      const result = await executePull(
        { fastForwardOnly: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--ff-only');
      expect(result.strategy).toBe('fast-forward');
    });

    it('does not add --ff-only when fastForwardOnly is false', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Already up to date.\n',
        stderr: '',
      });

      await executePull({ fastForwardOnly: false }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--ff-only');
    });
  });

  describe('strategy detection', () => {
    it('detects fast-forward strategy from output', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: `Updating abc123..def456
Fast-forward
 file.txt | 1 +
 1 file changed, 1 insertion(+)`,
        stderr: '',
      });

      const result = await executePull({}, mockContext, mockExecGit);

      expect(result.strategy).toBe('fast-forward');
    });

    it('detects merge strategy by default', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Merge made by the recursive strategy.\n file.txt | 1 +\n',
        stderr: '',
      });

      const result = await executePull({}, mockContext, mockExecGit);

      expect(result.strategy).toBe('merge');
    });

    it('detects rebase strategy when rebase option is set', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Successfully rebased and updated refs/heads/main.\n',
        stderr: '',
      });

      const result = await executePull(
        { rebase: true },
        mockContext,
        mockExecGit,
      );

      expect(result.strategy).toBe('rebase');
    });
  });

  describe('conflict detection', () => {
    it('detects conflicts in stdout', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: `Auto-merging file.txt
CONFLICT (content): Merge conflict in file.txt
Automatic merge failed; fix conflicts and then commit the result.`,
        stderr: '',
      });

      const result = await executePull({}, mockContext, mockExecGit);

      expect(result.success).toBe(false);
      expect(result.conflicts).toBe(true);
    });

    it('detects conflicts in stderr', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: 'CONFLICT (content): Merge conflict in file.txt\n',
      });

      const result = await executePull({}, mockContext, mockExecGit);

      expect(result.success).toBe(false);
      expect(result.conflicts).toBe(true);
    });

    it('reports no conflicts for clean pull', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Already up to date.\n',
        stderr: '',
      });

      const result = await executePull({}, mockContext, mockExecGit);

      expect(result.success).toBe(true);
      expect(result.conflicts).toBe(false);
    });
  });

  describe('files changed parsing', () => {
    it('parses changed files from output', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: `Updating abc123..def456
Fast-forward
 file1.txt | 1 +
 file2.txt | 3 ++-
 2 files changed, 3 insertions(+), 1 deletion(-)`,
        stderr: '',
      });

      const result = await executePull({}, mockContext, mockExecGit);

      expect(result.filesChanged.length).toBeGreaterThan(0);
    });

    it('filters out CONFLICT lines from filesChanged', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: `Auto-merging file.txt
CONFLICT (content): Merge conflict in file.txt
file.txt`,
        stderr: '',
      });

      const result = await executePull({}, mockContext, mockExecGit);

      const conflictLines = result.filesChanged.filter((f) =>
        f.includes('CONFLICT'),
      );
      expect(conflictLines).toHaveLength(0);
    });
  });

  describe('result structure', () => {
    it('returns correct structure for clean pull', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Already up to date.\n',
        stderr: '',
      });

      const result = await executePull({}, mockContext, mockExecGit);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('remote');
      expect(result).toHaveProperty('branch');
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('filesChanged');
    });

    it('returns specified remote and branch in result', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'Already up to date.\n',
        stderr: '',
      });

      const result = await executePull(
        { remote: 'upstream', branch: 'main' },
        mockContext,
        mockExecGit,
      );

      expect(result.remote).toBe('upstream');
      expect(result.branch).toBe('main');
    });
  });
});
