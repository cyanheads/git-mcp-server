/**
 * @fileoverview Unit tests for git push operation
 * @module tests/services/git/providers/cli/operations/remotes/push.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executePush } from '@/services/git/providers/cli/operations/remotes/push.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executePush', () => {
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

  describe('basic push operations', () => {
    it('pushes to default remote origin', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: 'Everything up-to-date\n',
      });

      const result = await executePush({}, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('push');
      expect(args).toContain('origin');
      expect(result.success).toBe(true);
      expect(result.remote).toBe('origin');
      expect(result.branch).toBe('HEAD');
    });

    it('pushes to specified remote', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executePush(
        { remote: 'upstream' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('upstream');
      expect(result.remote).toBe('upstream');
    });

    it('pushes specific branch', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executePush(
        { branch: 'feature-x' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('feature-x');
      expect(result.branch).toBe('feature-x');
    });
  });

  describe('force push options', () => {
    it('adds --force flag when force is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executePush({ force: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--force');
      expect(args).not.toContain('--force-with-lease');
    });

    it('adds --force-with-lease when forceWithLease is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executePush({ forceWithLease: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--force-with-lease');
      expect(args).not.toContain('--force');
    });

    it('prefers --force over --force-with-lease when both are true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executePush(
        { force: true, forceWithLease: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--force');
      expect(args).not.toContain('--force-with-lease');
    });
  });

  describe('set upstream option', () => {
    it('adds --set-upstream flag when setUpstream is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr:
          "Branch 'feature' set up to track remote branch 'feature' from 'origin'.\n",
      });

      const result = await executePush(
        { setUpstream: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--set-upstream');
      expect(result.upstreamSet).toBe(true);
    });

    it('returns upstreamSet false when setUpstream is not specified', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executePush({}, mockContext, mockExecGit);

      expect(result.upstreamSet).toBe(false);
    });
  });

  describe('tags option', () => {
    it('adds --tags flag when tags is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executePush({ tags: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--tags');
    });

    it('does not add --tags when tags is false', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executePush({ tags: false }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--tags');
    });
  });

  describe('dry run option', () => {
    it('adds --dry-run flag when dryRun is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executePush({ dryRun: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--dry-run');
    });
  });

  describe('pushed refs parsing', () => {
    it('parses new branch push from stderr', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: `To github.com:user/repo.git
 * [new branch]      feature -> feature\n`,
      });

      const result = await executePush(
        { branch: 'feature' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.pushedRefs).toContain('feature');
    });

    it('parses rejected refs from stderr', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: `To github.com:user/repo.git
 ! [rejected]        main -> main (non-fast-forward)\n`,
      });

      const result = await executePush(
        { branch: 'main' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(false);
      expect(result.rejectedRefs).toContain('main');
    });
  });

  describe('result structure', () => {
    it('returns correct structure for successful push', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: 'Everything up-to-date\n',
      });

      const result = await executePush({}, mockContext, mockExecGit);

      expect(result).toEqual({
        success: true,
        remote: 'origin',
        branch: 'HEAD',
        upstreamSet: false,
        pushedRefs: [],
        rejectedRefs: [],
      });
    });

    it('returns specified remote and branch in result', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executePush(
        { remote: 'upstream', branch: 'develop', setUpstream: true },
        mockContext,
        mockExecGit,
      );

      expect(result.remote).toBe('upstream');
      expect(result.branch).toBe('develop');
      expect(result.upstreamSet).toBe(true);
    });
  });
});
