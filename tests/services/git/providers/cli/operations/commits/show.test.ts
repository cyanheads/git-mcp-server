/**
 * @fileoverview Unit tests for git show operation
 * @module tests/services/git/providers/cli/operations/commits/show.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeShow } from '@/services/git/providers/cli/operations/commits/show.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeShow', () => {
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

  describe('basic show operations', () => {
    it('shows a commit object', async () => {
      const commitOutput = `commit abc123def456
Author: John Doe <john@example.com>
Date:   Mon Jan 1 00:00:00 2024 +0000

    Initial commit

diff --git a/file.txt b/file.txt
new file mode 100644
--- /dev/null
+++ b/file.txt
@@ -0,0 +1 @@
+hello`;

      mockExecGit.mockResolvedValueOnce({ stdout: commitOutput, stderr: '' });

      const result = await executeShow(
        { object: 'abc123' },
        mockContext,
        mockExecGit,
      );

      expect(result.object).toBe('abc123');
      expect(result.type).toBe('commit');
      expect(result.content).toBe(commitOutput);
      expect(result.metadata).toEqual({});
    });

    it('passes the object to git show args', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'commit abc123',
        stderr: '',
      });

      await executeShow({ object: 'HEAD~3' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('show');
      expect(args).toContain('HEAD~3');
    });
  });

  describe('stat option', () => {
    it('adds --stat flag when stat is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'commit abc123',
        stderr: '',
      });

      await executeShow(
        { object: 'abc123', stat: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--stat');
    });

    it('does not add --stat flag when stat is falsy', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'commit abc123',
        stderr: '',
      });

      await executeShow({ object: 'abc123' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--stat');
    });
  });

  describe('format option', () => {
    it('adds --format=raw when format is raw', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'commit abc123',
        stderr: '',
      });

      await executeShow(
        { object: 'abc123', format: 'raw' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--format=raw');
    });

    it('does not add --format flag when format is not raw', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'commit abc123',
        stderr: '',
      });

      await executeShow({ object: 'abc123' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      const formatArgs = args.filter((a: string) => a.startsWith('--format'));
      expect(formatArgs).toHaveLength(0);
    });
  });

  describe('type detection', () => {
    it('detects commit type from output', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'commit abc123def456\nAuthor: Test\nDate: now\n\n    msg',
        stderr: '',
      });

      const result = await executeShow(
        { object: 'abc123' },
        mockContext,
        mockExecGit,
      );

      expect(result.type).toBe('commit');
    });

    it('detects tree type from output', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'tree abc123\n100644 blob def456\tfile.txt',
        stderr: '',
      });

      const result = await executeShow(
        { object: 'abc123:' },
        mockContext,
        mockExecGit,
      );

      expect(result.type).toBe('tree');
    });

    it('detects tag type from output', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'tag v1.0.0\nTagger: John Doe\nDate: now\n\nRelease 1.0',
        stderr: '',
      });

      const result = await executeShow(
        { object: 'v1.0.0' },
        mockContext,
        mockExecGit,
      );

      expect(result.type).toBe('tag');
    });

    it('detects blob type when output has no commit/tree/tag markers', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'hello world\nthis is file content',
        stderr: '',
      });

      const result = await executeShow(
        { object: 'abc123:file.txt' },
        mockContext,
        mockExecGit,
      );

      expect(result.type).toBe('blob');
    });
  });

  describe('combined options', () => {
    it('handles stat + format=raw together', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: 'commit abc123',
        stderr: '',
      });

      await executeShow(
        { object: 'abc123', stat: true, format: 'raw' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--stat');
      expect(args).toContain('--format=raw');
    });
  });

  describe('error handling', () => {
    it('throws mapped error when git command fails', async () => {
      mockExecGit.mockRejectedValueOnce(new Error('fatal: bad object abc123'));

      await expect(
        executeShow({ object: 'abc123' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });
});
