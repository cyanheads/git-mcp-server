/**
 * @fileoverview Unit tests for git log operation
 * @module tests/services/git/providers/cli/operations/commits/log.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeLog } from '@/services/git/providers/cli/operations/commits/log.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

// The delimiters used in the log parsing (must match output-parser.ts)
const FIELD_DELIMITER = '\x1F'; // ASCII Unit Separator (same as GIT_FIELD_DELIMITER)
const COMMIT_START = '<<<COMMIT_START>>>';
const COMMIT_END = '<<<COMMIT_END>>>';

/**
 * Helper to build mock git log output with proper markers
 */
function buildLogOutput(
  commits: Array<{
    hash: string;
    shortHash: string;
    author: string;
    email: string;
    timestamp: number;
    subject: string;
    body?: string;
    parents?: string;
    stat?: string;
    patch?: string;
  }>,
): string {
  return commits
    .map((c) => {
      const fields = [
        c.hash,
        c.shortHash,
        c.author,
        c.email,
        c.timestamp.toString(),
        c.subject,
        c.body || '',
        c.parents || '',
      ].join(FIELD_DELIMITER);

      let extra = '';
      if (c.stat && c.patch) {
        extra = `\n${c.stat}\ndiff --git ${c.patch}`;
      } else if (c.stat) {
        extra = `\n${c.stat}`;
      } else if (c.patch) {
        extra = `\n${c.patch}`;
      }

      return `${COMMIT_START}${fields}${COMMIT_END}${extra}`;
    })
    .join('\n');
}

describe('executeLog', () => {
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

  describe('basic log operations', () => {
    it('returns empty commits array for empty repository', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await executeLog({}, mockContext, mockExecGit);

      expect(result.commits).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('parses single commit correctly', async () => {
      const output = buildLogOutput([
        {
          hash: 'abc123def456789',
          shortHash: 'abc123d',
          author: 'John Doe',
          email: 'john@example.com',
          timestamp: 1609459200,
          subject: 'Initial commit',
          body: 'This is the body',
          parents: '',
        },
      ]);

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeLog({}, mockContext, mockExecGit);

      expect(result.commits).toHaveLength(1);
      expect(result.totalCount).toBe(1);

      const commit = result.commits[0]!;
      expect(commit.hash).toBe('abc123def456789');
      expect(commit.shortHash).toBe('abc123d');
      expect(commit.author).toBe('John Doe');
      expect(commit.authorEmail).toBe('john@example.com');
      expect(commit.timestamp).toBe(1609459200);
      expect(commit.subject).toBe('Initial commit');
      expect(commit.body).toBe('This is the body');
      expect(commit.parents).toEqual([]);
    });

    it('parses multiple commits correctly', async () => {
      const output = buildLogOutput([
        {
          hash: 'commit1hash',
          shortHash: 'commit1',
          author: 'Author 1',
          email: 'a1@test.com',
          timestamp: 1000,
          subject: 'First',
          parents: '',
        },
        {
          hash: 'commit2hash',
          shortHash: 'commit2',
          author: 'Author 2',
          email: 'a2@test.com',
          timestamp: 2000,
          subject: 'Second',
          parents: 'commit1hash',
        },
        {
          hash: 'commit3hash',
          shortHash: 'commit3',
          author: 'Author 3',
          email: 'a3@test.com',
          timestamp: 3000,
          subject: 'Third',
          parents: 'commit2hash',
        },
      ]);

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeLog({}, mockContext, mockExecGit);

      expect(result.commits).toHaveLength(3);
      expect(result.totalCount).toBe(3);
      expect(result.commits[0]!.subject).toBe('First');
      expect(result.commits[1]!.subject).toBe('Second');
      expect(result.commits[2]!.subject).toBe('Third');
    });

    it('parses merge commits with multiple parents', async () => {
      const output = buildLogOutput([
        {
          hash: 'mergecommit',
          shortHash: 'merge',
          author: 'Merger',
          email: 'merger@test.com',
          timestamp: 1000,
          subject: 'Merge branch feature',
          parents: 'parent1 parent2',
        },
      ]);

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeLog({}, mockContext, mockExecGit);

      expect(result.commits[0]!.parents).toEqual(['parent1', 'parent2']);
    });
  });

  describe('maxCount option', () => {
    it('adds -n flag with maxCount value', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ maxCount: 10 }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-n10');
    });

    it('limits to single commit with maxCount 1', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ maxCount: 1 }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-n1');
    });
  });

  describe('skip option', () => {
    it('adds --skip flag with skip value', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ skip: 5 }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--skip=5');
    });

    it('combines skip with maxCount for pagination', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ skip: 10, maxCount: 5 }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--skip=10');
      expect(args).toContain('-n5');
    });
  });

  describe('date filter options', () => {
    it('adds --since flag', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ since: '2024-01-01' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--since=2024-01-01');
    });

    it('adds --until flag', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ until: '2024-12-31' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--until=2024-12-31');
    });

    it('combines since and until for date range', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog(
        { since: '2024-01-01', until: '2024-06-30' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--since=2024-01-01');
      expect(args).toContain('--until=2024-06-30');
    });
  });

  describe('author filter option', () => {
    it('adds --author flag', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ author: 'John Doe' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--author=John Doe');
    });

    it('supports email pattern in author filter', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ author: '@example.com' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--author=@example.com');
    });
  });

  describe('grep option', () => {
    it('adds --grep flag', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ grep: 'fix:' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--grep=fix:');
    });
  });

  describe('branch option', () => {
    it('adds branch name to args', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ branch: 'develop' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('develop');
    });
  });

  describe('path filter option', () => {
    it('adds path filter with -- separator', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ path: 'src/index.ts' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      const dashDashIdx = args.indexOf('--');
      expect(dashDashIdx).toBeGreaterThan(-1);
      expect(args[dashDashIdx + 1]).toBe('src/index.ts');
    });
  });

  describe('stat option', () => {
    it('adds --stat flag when stat is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ stat: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--stat');
    });

    it('includes stat content in commit result', async () => {
      const statContent =
        'file.txt | 10 +++++++---\n 1 file changed, 7 insertions(+), 3 deletions(-)';
      const output = buildLogOutput([
        {
          hash: 'abc123',
          shortHash: 'abc',
          author: 'Test',
          email: 'test@test.com',
          timestamp: 1000,
          subject: 'Test commit',
          stat: statContent,
        },
      ]);

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeLog({ stat: true }, mockContext, mockExecGit);

      expect(result.commits[0]!.stat).toBe(statContent);
    });

    it('handles commits with no file changes in stat mode', async () => {
      const output = buildLogOutput([
        {
          hash: 'abc123',
          shortHash: 'abc',
          author: 'Test',
          email: 'test@test.com',
          timestamp: 1000,
          subject: 'Empty commit',
        },
      ]);

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeLog({ stat: true }, mockContext, mockExecGit);

      expect(result.commits[0]!.stat).toBeUndefined();
    });
  });

  describe('patch option', () => {
    it('adds -p flag when patch is true', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ patch: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-p');
    });

    it('includes patch content in commit result', async () => {
      const patchContent = `diff --git a/file.txt b/file.txt
index abc123..def456 100644
--- a/file.txt
+++ b/file.txt
@@ -1 +1,2 @@
 original
+added line`;

      const output = buildLogOutput([
        {
          hash: 'abc123',
          shortHash: 'abc',
          author: 'Test',
          email: 'test@test.com',
          timestamp: 1000,
          subject: 'Test commit',
          patch: patchContent,
        },
      ]);

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeLog(
        { patch: true },
        mockContext,
        mockExecGit,
      );

      expect(result.commits[0]!.patch).toContain('diff --git');
      expect(result.commits[0]!.patch).toContain('+added line');
    });
  });

  describe('stat + patch combined', () => {
    it('adds both --stat and -p flags', async () => {
      mockExecGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeLog({ stat: true, patch: true }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--stat');
      expect(args).toContain('-p');
    });

    it('correctly splits stat and patch content', async () => {
      // When both stat and patch are requested, git outputs stat first, then patch
      const statContent = 'file.txt | 1 +\n 1 file changed, 1 insertion(+)';
      const patchContent = `a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -0,0 +1 @@
+new line`;

      const output = buildLogOutput([
        {
          hash: 'abc123',
          shortHash: 'abc',
          author: 'Test',
          email: 'test@test.com',
          timestamp: 1000,
          subject: 'Test commit',
          stat: statContent,
          patch: patchContent,
        },
      ]);

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeLog(
        { stat: true, patch: true },
        mockContext,
        mockExecGit,
      );

      const commit = result.commits[0]!;
      expect(commit.stat).toBe(statContent);
      expect(commit.patch).toContain('a/file.txt b/file.txt');
    });
  });

  describe('multi-line commit bodies', () => {
    it('preserves multi-line commit body', async () => {
      const body = `This is line 1
This is line 2
This is line 3`;

      const output = buildLogOutput([
        {
          hash: 'abc123',
          shortHash: 'abc',
          author: 'Test',
          email: 'test@test.com',
          timestamp: 1000,
          subject: 'Multi-line body',
          body: body,
        },
      ]);

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeLog({}, mockContext, mockExecGit);

      expect(result.commits[0]!.body).toBe(body);
    });
  });

  describe('special characters in commit messages', () => {
    it('handles special characters in subject', async () => {
      const output = buildLogOutput([
        {
          hash: 'abc123',
          shortHash: 'abc',
          author: 'Test',
          email: 'test@test.com',
          timestamp: 1000,
          subject: 'feat: add "quotes" & <special> chars $var',
        },
      ]);

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeLog({}, mockContext, mockExecGit);

      expect(result.commits[0]!.subject).toBe(
        'feat: add "quotes" & <special> chars $var',
      );
    });
  });

  describe('empty body handling', () => {
    it('does not set body when empty', async () => {
      const output = buildLogOutput([
        {
          hash: 'abc123',
          shortHash: 'abc',
          author: 'Test',
          email: 'test@test.com',
          timestamp: 1000,
          subject: 'No body',
          body: '',
        },
      ]);

      mockExecGit.mockResolvedValueOnce({ stdout: output, stderr: '' });

      const result = await executeLog({}, mockContext, mockExecGit);

      expect(result.commits[0]!.body).toBeUndefined();
    });
  });
});
