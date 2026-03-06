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

      mockExecGit
        .mockResolvedValueOnce({ stdout: 'commit\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({ stdout: commitOutput, stderr: '' }); // show

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
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'commit\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({ stdout: 'commit abc123', stderr: '' }); // show

      await executeShow({ object: 'HEAD~3' }, mockContext, mockExecGit);

      // Second call is the show command
      const [showArgs] = mockExecGit.mock.calls[1]!;
      expect(showArgs).toContain('show');
      expect(showArgs).toContain('HEAD~3');
    });
  });

  describe('stat option', () => {
    it('adds --stat flag when stat is true', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'commit\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({ stdout: 'commit abc123', stderr: '' }); // show

      await executeShow(
        { object: 'abc123', stat: true },
        mockContext,
        mockExecGit,
      );

      const [showArgs] = mockExecGit.mock.calls[1]!;
      expect(showArgs).toContain('--stat');
    });

    it('does not add --stat flag when stat is falsy', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'commit\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({ stdout: 'commit abc123', stderr: '' }); // show

      await executeShow({ object: 'abc123' }, mockContext, mockExecGit);

      const [showArgs] = mockExecGit.mock.calls[1]!;
      expect(showArgs).not.toContain('--stat');
    });
  });

  describe('format option', () => {
    it('adds --format=raw when format is raw', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'commit\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({ stdout: 'commit abc123', stderr: '' }); // show

      await executeShow(
        { object: 'abc123', format: 'raw' },
        mockContext,
        mockExecGit,
      );

      const [showArgs] = mockExecGit.mock.calls[1]!;
      expect(showArgs).toContain('--format=raw');
    });

    it('does not add --format flag when format is not raw', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'commit\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({ stdout: 'commit abc123', stderr: '' }); // show

      await executeShow({ object: 'abc123' }, mockContext, mockExecGit);

      const [showArgs] = mockExecGit.mock.calls[1]!;
      const formatArgs = showArgs.filter((a: string) =>
        a.startsWith('--format'),
      );
      expect(formatArgs).toHaveLength(0);
    });
  });

  describe('type detection', () => {
    it('detects commit type via cat-file -t', async () => {
      // Realistic commit output — contains "tree <hash>" in the header,
      // which previously caused misclassification as 'tree'.
      const commitOutput = `commit abc123def456
tree 9876543210abcdef9876543210abcdef98765432
Author: Test User <test@example.com>
Date:   Mon Jan 1 00:00:00 2024 +0000

    Initial commit`;

      mockExecGit
        .mockResolvedValueOnce({ stdout: 'commit\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({ stdout: commitOutput, stderr: '' }); // show

      const result = await executeShow(
        { object: 'abc123' },
        mockContext,
        mockExecGit,
      );

      expect(result.type).toBe('commit');
      // Verify cat-file -t was called
      const [catFileArgs] = mockExecGit.mock.calls[0]!;
      expect(catFileArgs).toContain('cat-file');
      expect(catFileArgs).toContain('-t');
      expect(catFileArgs).toContain('abc123');
    });

    it('detects tree type via cat-file -t', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'tree\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({
          stdout: '100644 blob def456\tfile.txt',
          stderr: '',
        }); // show

      const result = await executeShow(
        { object: 'abc123:' },
        mockContext,
        mockExecGit,
      );

      expect(result.type).toBe('tree');
    });

    it('detects tag type via cat-file -t', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'tag\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({
          stdout: 'tag v1.0.0\nTagger: John Doe\nDate: now\n\nRelease 1.0',
          stderr: '',
        }); // show

      const result = await executeShow(
        { object: 'v1.0.0' },
        mockContext,
        mockExecGit,
      );

      expect(result.type).toBe('tag');
    });

    it('detects blob type via cat-file -t', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'blob\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({
          stdout: 'hello world\nthis is file content',
          stderr: '',
        }); // show

      const result = await executeShow(
        { object: 'abc123:file.txt' },
        mockContext,
        mockExecGit,
      );

      expect(result.type).toBe('blob');
    });

    it('defaults to commit for unrecognized cat-file output', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'unknown\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({ stdout: 'some content', stderr: '' }); // show

      const result = await executeShow(
        { object: 'abc123' },
        mockContext,
        mockExecGit,
      );

      expect(result.type).toBe('commit');
    });
  });

  describe('combined options', () => {
    it('handles stat + format=raw together', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'commit\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({ stdout: 'commit abc123', stderr: '' }); // show

      await executeShow(
        { object: 'abc123', stat: true, format: 'raw' },
        mockContext,
        mockExecGit,
      );

      const [showArgs] = mockExecGit.mock.calls[1]!;
      expect(showArgs).toContain('--stat');
      expect(showArgs).toContain('--format=raw');
    });
  });

  describe('argument ordering', () => {
    it('places flags before object ref', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'commit\n', stderr: '' }) // cat-file -t
        .mockResolvedValueOnce({ stdout: 'commit abc123', stderr: '' }); // show

      await executeShow(
        { object: 'abc123', stat: true, format: 'raw' },
        mockContext,
        mockExecGit,
      );

      const [showArgs] = mockExecGit.mock.calls[1]!;
      const objectIdx = showArgs.indexOf('abc123');
      expect(objectIdx).toBeGreaterThan(-1);
      expect(showArgs.indexOf('--stat')).toBeLessThan(objectIdx);
      expect(showArgs.indexOf('--format=raw')).toBeLessThan(objectIdx);
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
