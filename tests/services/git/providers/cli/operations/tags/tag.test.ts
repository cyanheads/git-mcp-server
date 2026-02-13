/**
 * @fileoverview Unit tests for git tag operation
 * @module tests/services/git/providers/cli/operations/tags/tag.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeTag } from '@/services/git/providers/cli/operations/tags/tag.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

// Mock shouldSignCommits to always return false in tests
vi.mock('@/services/git/providers/cli/utils/config-helper.js', () => ({
  shouldSignCommits: () => false,
}));

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeTag', () => {
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
    it('lists tags with -l flag', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'v1.0.0\nv1.1.0\nv2.0.0\n',
        stderr: '',
      });

      const result = await executeTag(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('tag');
      expect(args).toContain('-l');
      expect(result.mode).toBe('list');
      expect(result.tags).toHaveLength(3);
      expect(result.tags![0]!.name).toBe('v1.0.0');
      expect(result.tags![1]!.name).toBe('v1.1.0');
      expect(result.tags![2]!.name).toBe('v2.0.0');
    });

    it('returns empty tags array for no tags', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeTag(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result.tags).toHaveLength(0);
    });
  });

  describe('create mode', () => {
    it('creates a simple lightweight tag', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeTag(
        { mode: 'create', tagName: 'v1.0.0' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('tag');
      expect(args).toContain('v1.0.0');
      expect(args).not.toContain('-a');
      expect(args).not.toContain('-m');
      expect(result.mode).toBe('create');
      expect(result.created).toBe('v1.0.0');
    });

    it('creates an annotated tag with message', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeTag(
        {
          mode: 'create',
          tagName: 'v2.0.0',
          annotated: true,
          message: 'Release version 2.0.0',
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('tag');
      expect(args).toContain('v2.0.0');
      expect(args).toContain('-a');
      expect(args).toContain('-m');
      expect(args).toContain('Release version 2.0.0');
      expect(result.created).toBe('v2.0.0');
    });

    it('creates a tag at specific commit', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeTag(
        { mode: 'create', tagName: 'v1.0.0', commit: 'abc123' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('abc123');
    });

    it('creates a tag with --force flag', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeTag(
        { mode: 'create', tagName: 'v1.0.0', force: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--force');
    });

    it('does not add -a without annotated and message', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeTag(
        { mode: 'create', tagName: 'v1.0.0' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('-a');
      expect(args).not.toContain('-m');
    });

    it('throws error when tagName is missing', async () => {
      await expect(
        executeTag({ mode: 'create' } as any, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });

  describe('delete mode', () => {
    it('deletes a tag with -d flag', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: "Deleted tag 'v1.0.0' (was abc123)\n",
        stderr: '',
      });

      const result = await executeTag(
        { mode: 'delete', tagName: 'v1.0.0' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('tag');
      expect(args).toContain('-d');
      expect(args).toContain('v1.0.0');
      expect(result.mode).toBe('delete');
      expect(result.deleted).toBe('v1.0.0');
    });

    it('throws error when tagName is missing for delete', async () => {
      await expect(
        executeTag({ mode: 'delete' } as any, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });

  describe('result structure', () => {
    it('returns correct structure for list', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'v1.0.0\n',
        stderr: '',
      });

      const result = await executeTag(
        { mode: 'list' },
        mockContext,
        mockExecGit,
      );

      expect(result).toHaveProperty('mode', 'list');
      expect(result).toHaveProperty('tags');
    });

    it('returns correct structure for create', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeTag(
        { mode: 'create', tagName: 'v1.0.0' },
        mockContext,
        mockExecGit,
      );

      expect(result).toHaveProperty('mode', 'create');
      expect(result).toHaveProperty('created', 'v1.0.0');
    });

    it('returns correct structure for delete', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeTag(
        { mode: 'delete', tagName: 'v1.0.0' },
        mockContext,
        mockExecGit,
      );

      expect(result).toHaveProperty('mode', 'delete');
      expect(result).toHaveProperty('deleted', 'v1.0.0');
    });
  });
});
