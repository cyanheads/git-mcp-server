/**
 * @fileoverview Unit tests for git commit operation
 * @module tests/services/git/providers/cli/operations/commits/commit.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeCommit } from '@/services/git/providers/cli/operations/commits/commit.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

// Mock shouldSignCommits to return false by default so signing doesn't interfere
vi.mock('@/services/git/providers/cli/utils/config-helper.js', () => ({
  shouldSignCommits: vi.fn(() => false),
  loadConfig: vi.fn(() => null),
}));

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

// The delimiters used by the commit operation for git show format
const FIELD_DELIM = '\x1F';
const RECORD_DELIM = '\x1E';

describe('executeCommit', () => {
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

  describe('basic commit', () => {
    it('creates a commit with a message', async () => {
      const showOutput = `John Doe${FIELD_DELIM}1700000000${RECORD_DELIM}\nsrc/index.ts\nREADME.md\n`;

      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // commit
        .mockResolvedValueOnce({ stdout: 'abc123def456\n', stderr: '' }) // rev-parse HEAD
        .mockResolvedValueOnce({ stdout: showOutput, stderr: '' }); // git show

      const result = await executeCommit(
        { message: 'feat: add new feature' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc123def456');
      expect(result.message).toBe('feat: add new feature');
      expect(result.author).toBe('John Doe');
      expect(result.timestamp).toBe(1700000000);
      expect(result.filesChanged).toContain('src/index.ts');
      expect(result.filesChanged).toContain('README.md');
    });

    it('passes -m flag with the commit message', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Author${FIELD_DELIM}0${RECORD_DELIM}\n`,
          stderr: '',
        });

      await executeCommit(
        { message: 'fix: resolve bug' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('commit');
      expect(args).toContain('-m');
      expect(args).toContain('fix: resolve bug');
    });
  });

  describe('amend option', () => {
    it('passes --amend flag when amend is true', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Author${FIELD_DELIM}0${RECORD_DELIM}\n`,
          stderr: '',
        });

      await executeCommit(
        { message: 'fix: updated message', amend: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--amend');
    });

    it('does not pass --amend when amend is false', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Author${FIELD_DELIM}0${RECORD_DELIM}\n`,
          stderr: '',
        });

      await executeCommit(
        { message: 'new commit', amend: false },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--amend');
    });
  });

  describe('allow-empty option', () => {
    it('passes --allow-empty flag when allowEmpty is true', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Author${FIELD_DELIM}0${RECORD_DELIM}\n`,
          stderr: '',
        });

      await executeCommit(
        { message: 'empty commit', allowEmpty: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--allow-empty');
    });
  });

  describe('no-verify option', () => {
    it('passes --no-verify flag when noVerify is true', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Author${FIELD_DELIM}0${RECORD_DELIM}\n`,
          stderr: '',
        });

      await executeCommit(
        { message: 'skip hooks', noVerify: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--no-verify');
    });
  });

  describe('signing option', () => {
    it('passes --gpg-sign flag when sign is true', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Author${FIELD_DELIM}0${RECORD_DELIM}\n`,
          stderr: '',
        });

      await executeCommit(
        { message: 'signed commit', sign: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--gpg-sign');
    });

    it('does not pass --gpg-sign when sign is false', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Author${FIELD_DELIM}0${RECORD_DELIM}\n`,
          stderr: '',
        });

      await executeCommit(
        { message: 'unsigned commit', sign: false },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('--gpg-sign');
    });
  });

  describe('author option', () => {
    it('passes --author flag with formatted name and email', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Jane Smith${FIELD_DELIM}1700000000${RECORD_DELIM}\n`,
          stderr: '',
        });

      await executeCommit(
        {
          message: 'commit with author',
          author: { name: 'Jane Smith', email: 'jane@example.com' },
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--author=Jane Smith <jane@example.com>');
    });
  });

  describe('git show parsing', () => {
    it('parses author name from show output', async () => {
      const showOutput = `Alice${FIELD_DELIM}1700001234${RECORD_DELIM}\nfile1.ts\n`;

      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'def456\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: showOutput, stderr: '' });

      const result = await executeCommit(
        { message: 'test' },
        mockContext,
        mockExecGit,
      );

      expect(result.author).toBe('Alice');
      expect(result.timestamp).toBe(1700001234);
    });

    it('parses files changed from show output', async () => {
      const showOutput = `Bob${FIELD_DELIM}1700000000${RECORD_DELIM}\nsrc/a.ts\nsrc/b.ts\nsrc/c.ts\n`;

      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: showOutput, stderr: '' });

      const result = await executeCommit(
        { message: 'test' },
        mockContext,
        mockExecGit,
      );

      expect(result.filesChanged).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    });

    it('handles empty files list', async () => {
      const showOutput = `Author${FIELD_DELIM}0${RECORD_DELIM}\n`;

      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: showOutput, stderr: '' });

      const result = await executeCommit(
        { message: 'empty commit', allowEmpty: true },
        mockContext,
        mockExecGit,
      );

      expect(result.filesChanged).toEqual([]);
    });

    it('trims commit hash from rev-parse', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '  abc123  \n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Author${FIELD_DELIM}0${RECORD_DELIM}\n`,
          stderr: '',
        });

      const result = await executeCommit(
        { message: 'test' },
        mockContext,
        mockExecGit,
      );

      expect(result.commitHash).toBe('abc123');
    });
  });

  describe('execution order', () => {
    it('calls commit, then rev-parse, then show in sequence', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Author${FIELD_DELIM}0${RECORD_DELIM}\n`,
          stderr: '',
        });

      await executeCommit({ message: 'test' }, mockContext, mockExecGit);

      expect(mockExecGit).toHaveBeenCalledTimes(3);

      // First call: commit
      const [commitArgs] = mockExecGit.mock.calls[0]!;
      expect(commitArgs).toContain('commit');

      // Second call: rev-parse
      const [revParseArgs] = mockExecGit.mock.calls[1]!;
      expect(revParseArgs).toContain('rev-parse');

      // Third call: show
      const [showArgs] = mockExecGit.mock.calls[2]!;
      expect(showArgs).toContain('show');
    });

    it('passes the commit hash from rev-parse to show', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'deadbeef\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Author${FIELD_DELIM}0${RECORD_DELIM}\n`,
          stderr: '',
        });

      await executeCommit({ message: 'test' }, mockContext, mockExecGit);

      const [showArgs] = mockExecGit.mock.calls[2]!;
      expect(showArgs).toContain('deadbeef');
    });
  });

  describe('combined options', () => {
    it('handles amend + no-verify + author together', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: `Jane${FIELD_DELIM}1700000000${RECORD_DELIM}\nfile.ts\n`,
          stderr: '',
        });

      await executeCommit(
        {
          message: 'amended commit',
          amend: true,
          noVerify: true,
          author: { name: 'Jane', email: 'jane@test.com' },
        },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('--amend');
      expect(args).toContain('--no-verify');
      expect(args).toContain('--author=Jane <jane@test.com>');
    });
  });

  describe('error handling', () => {
    it('throws mapped git error on commit failure', async () => {
      mockExecGit.mockRejectedValueOnce(
        new Error('nothing to commit, working tree clean'),
      );

      await expect(
        executeCommit({ message: 'empty commit' }, mockContext, mockExecGit),
      ).rejects.toThrow();
    });
  });
});
