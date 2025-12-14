/**
 * @fileoverview Unit tests for git diff operation
 * @module tests/services/git/providers/cli/operations/commits/diff.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeDiff } from '@/services/git/providers/cli/operations/commits/diff.js';
import type {
  GitDiffOptions,
  GitOperationContext,
} from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

describe('executeDiff', () => {
  const mockContext: GitOperationContext = {
    workingDirectory: '/test/repo',
    requestContext: {
      requestId: 'test-request-id',
    } as RequestContext,
    tenantId: 'test-tenant',
  };

  let mockExecGit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExecGit = vi.fn();
  });

  describe('basic diff operations', () => {
    it('returns empty diff when no changes', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // diff
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // stat

      const result = await executeDiff({}, mockContext, mockExecGit);

      expect(result.diff).toBe('');
      expect(result.filesChanged).toBe(0);
    });

    it('returns diff content for unstaged changes', async () => {
      const diffOutput = `diff --git a/file.txt b/file.txt
index abc123..def456 100644
--- a/file.txt
+++ b/file.txt
@@ -1 +1,2 @@
 original
+modified`;

      const statOutput = ` file.txt | 1 +
 1 file changed, 1 insertion(+)`;

      mockExecGit
        .mockResolvedValueOnce({ stdout: diffOutput, stderr: '' })
        .mockResolvedValueOnce({ stdout: statOutput, stderr: '' });

      const result = await executeDiff({}, mockContext, mockExecGit);

      expect(result.diff).toBe(diffOutput);
      expect(result.filesChanged).toBe(1);
      expect(result.insertions).toBe(1);
      expect(result.deletions).toBe(0);
    });
  });

  describe('staged option', () => {
    it('adds --cached flag when staged is true', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeDiff({ staged: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('--cached');
    });

    it('does not add --cached flag when staged is false', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeDiff({ staged: false }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0];
      expect(args).not.toContain('--cached');
    });
  });

  describe('nameOnly option', () => {
    it('adds --name-only flag when nameOnly is true', async () => {
      const nameOnlyOutput = `file1.txt
file2.txt
file3.txt`;

      mockExecGit.mockResolvedValueOnce({
        stdout: nameOnlyOutput,
        stderr: '',
      });

      const result = await executeDiff({ nameOnly: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('--name-only');
      expect(result.diff).toBe(nameOnlyOutput);
      expect(result.filesChanged).toBe(3);
    });

    it('counts files correctly in nameOnly mode', async () => {
      const nameOnlyOutput = `src/index.ts
src/utils.ts`;

      mockExecGit.mockResolvedValueOnce({
        stdout: nameOnlyOutput,
        stderr: '',
      });

      const result = await executeDiff({ nameOnly: true }, mockContext, mockExecGit);

      expect(result.filesChanged).toBe(2);
      expect(result.binary).toBe(false);
    });
  });

  describe('contextLines (unified) option', () => {
    it('adds --unified flag with specified context lines', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeDiff({ unified: 5 }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('--unified=5');
    });

    it('adds --unified=0 for zero context lines', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeDiff({ unified: 0 }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('--unified=0');
    });
  });

  describe('commit comparison (source/target)', () => {
    it('compares two commits using commit1 and commit2', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'diff content', stderr: '' })
        .mockResolvedValueOnce({ stdout: ' 1 file changed', stderr: '' });

      await executeDiff(
        { commit1: 'abc123', commit2: 'def456' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('abc123');
      expect(args).toContain('def456');
      // commit1 should come before commit2
      const idx1 = args.indexOf('abc123');
      const idx2 = args.indexOf('def456');
      expect(idx1).toBeLessThan(idx2);
    });

    it('compares single commit against working tree', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeDiff({ commit1: 'HEAD~1' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('HEAD~1');
    });
  });

  describe('stat option', () => {
    it('returns only stat output when stat is true', async () => {
      const statOutput = ` file1.txt | 10 +++++++---
 file2.txt |  5 +++++
 2 files changed, 12 insertions(+), 3 deletions(-)`;

      mockExecGit.mockResolvedValueOnce({ stdout: statOutput, stderr: '' });

      const result = await executeDiff({ stat: true }, mockContext, mockExecGit);

      expect(result.diff).toBe(statOutput);
      expect(result.filesChanged).toBe(2);
      expect(result.insertions).toBe(12);
      expect(result.deletions).toBe(3);
    });

    it('detects binary files in stat mode', async () => {
      const statOutput = ` image.png | Binary files differ
 1 file changed`;

      mockExecGit.mockResolvedValueOnce({ stdout: statOutput, stderr: '' });

      const result = await executeDiff({ stat: true }, mockContext, mockExecGit);

      expect(result.binary).toBe(true);
    });
  });

  describe('includeUntracked option', () => {
    it('includes untracked files in nameOnly mode', async () => {
      // First call: regular diff --name-only
      mockExecGit.mockResolvedValueOnce({
        stdout: 'tracked.txt\n',
        stderr: '',
      });
      // Second call: ls-files for untracked
      mockExecGit.mockResolvedValueOnce({
        stdout: 'untracked.txt\n',
        stderr: '',
      });

      const result = await executeDiff(
        { nameOnly: true, includeUntracked: true },
        mockContext,
        mockExecGit,
      );

      expect(result.diff).toContain('tracked.txt');
      expect(result.diff).toContain('untracked.txt');
      expect(result.filesChanged).toBe(2);
    });

    it('includes untracked file diffs with full content', async () => {
      const trackedDiff = `diff --git a/tracked.txt b/tracked.txt
--- a/tracked.txt
+++ b/tracked.txt
@@ -1 +1,2 @@
 original
+modified`;

      const untrackedDiff = `diff --git a/untracked.txt b/untracked.txt
new file mode 100644
--- /dev/null
+++ b/untracked.txt
@@ -0,0 +1 @@
+new content`;

      mockExecGit
        // Regular diff
        .mockResolvedValueOnce({ stdout: trackedDiff, stderr: '' })
        // ls-files for untracked
        .mockResolvedValueOnce({ stdout: 'untracked.txt\n', stderr: '' })
        // diff --no-index for untracked file (throws with exit code 1)
        .mockRejectedValueOnce(
          new Error(`Exit Code: 1\nStderr: \nStdout: ${untrackedDiff}`),
        )
        // stat
        .mockResolvedValueOnce({
          stdout: ' tracked.txt | 1 +\n 1 file changed, 1 insertion(+)',
          stderr: '',
        });

      const result = await executeDiff(
        { includeUntracked: true },
        mockContext,
        mockExecGit,
      );

      expect(result.diff).toContain('tracked.txt');
      expect(result.diff).toContain('untracked.txt');
      expect(result.diff).toContain('new content');
      expect(result.filesChanged).toBe(2); // 1 tracked + 1 untracked
    });

    it('handles empty untracked files list', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'diff content', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // no untracked files
        .mockResolvedValueOnce({
          stdout: ' file.txt | 1 +\n 1 file changed, 1 insertion(+)',
          stderr: '',
        });

      const result = await executeDiff(
        { includeUntracked: true },
        mockContext,
        mockExecGit,
      );

      expect(result.filesChanged).toBe(1);
    });

    it('handles multiple untracked files', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // no tracked changes
        .mockResolvedValueOnce({
          stdout: 'file1.txt\nfile2.txt\nfile3.txt\n',
          stderr: '',
        })
        // Three untracked file diffs
        .mockRejectedValueOnce(
          new Error('Exit Code: 1\nStderr: \nStdout: diff file1'),
        )
        .mockRejectedValueOnce(
          new Error('Exit Code: 1\nStderr: \nStdout: diff file2'),
        )
        .mockRejectedValueOnce(
          new Error('Exit Code: 1\nStderr: \nStdout: diff file3'),
        )
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // stat

      const result = await executeDiff(
        { includeUntracked: true },
        mockContext,
        mockExecGit,
      );

      expect(result.diff).toContain('diff file1');
      expect(result.diff).toContain('diff file2');
      expect(result.diff).toContain('diff file3');
      expect(result.filesChanged).toBe(3);
    });
  });

  describe('path filter option', () => {
    it('adds path filter with -- separator', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeDiff({ path: 'src/index.ts' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0];
      const dashDashIdx = args.indexOf('--');
      expect(dashDashIdx).toBeGreaterThan(-1);
      expect(args[dashDashIdx + 1]).toBe('src/index.ts');
    });
  });

  describe('binary file detection', () => {
    it('detects binary files in diff output', async () => {
      const diffOutput = `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ`;

      mockExecGit
        .mockResolvedValueOnce({ stdout: diffOutput, stderr: '' })
        .mockResolvedValueOnce({ stdout: ' image.png | Bin', stderr: '' });

      const result = await executeDiff({}, mockContext, mockExecGit);

      expect(result.binary).toBe(true);
    });

    it('returns binary false when no binary files', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'text diff', stderr: '' })
        .mockResolvedValueOnce({
          stdout: ' file.txt | 1 +\n 1 file changed',
          stderr: '',
        });

      const result = await executeDiff({}, mockContext, mockExecGit);

      expect(result.binary).toBe(false);
    });
  });

  describe('argument ordering', () => {
    it('places flags before commit refs', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeDiff(
        { staged: true, commit1: 'HEAD~1', unified: 3 },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      const cachedIdx = args.indexOf('--cached');
      const unifiedIdx = args.findIndex((a: string) =>
        a.startsWith('--unified='),
      );
      const commitIdx = args.indexOf('HEAD~1');

      expect(cachedIdx).toBeLessThan(commitIdx);
      expect(unifiedIdx).toBeLessThan(commitIdx);
    });

    it('places path filter after -- separator at the end', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeDiff(
        { commit1: 'abc', commit2: 'def', path: 'src/' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      const dashDashIdx = args.indexOf('--');
      expect(dashDashIdx).toBe(args.length - 2);
      expect(args[args.length - 1]).toBe('src/');
    });
  });

  describe('combined options', () => {
    it('handles staged + nameOnly + includeUntracked', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'staged.txt\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'untracked.txt\n', stderr: '' });

      const result = await executeDiff(
        { staged: true, nameOnly: true, includeUntracked: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('--cached');
      expect(args).toContain('--name-only');
      expect(result.filesChanged).toBe(2);
    });
  });
});
