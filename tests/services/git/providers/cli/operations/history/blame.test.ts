/**
 * @fileoverview Unit tests for git blame operation
 * @module tests/services/git/providers/cli/operations/history/blame.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeBlame } from '@/services/git/providers/cli/operations/history/blame.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

describe('executeBlame', () => {
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

  describe('basic blame operations', () => {
    it('runs blame with --porcelain flag', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeBlame({ file: 'src/index.ts' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('blame');
      expect(args).toContain('--porcelain');
      expect(args).toContain('--');
      expect(args).toContain('src/index.ts');
    });

    it('parses porcelain blame output correctly', async () => {
      const porcelainOutput = `abc123def456789012345678901234567890abcd 1 1 1
author John Doe
author-mail <john@example.com>
author-time 1609459200
author-tz +0000
committer John Doe
committer-mail <john@example.com>
committer-time 1609459200
committer-tz +0000
summary Initial commit
filename src/index.ts
\tconst hello = 'world';
def456789012345678901234567890abcdef012345 2 2 1
author Jane Smith
author-mail <jane@example.com>
author-time 1609545600
author-tz +0000
committer Jane Smith
committer-mail <jane@example.com>
committer-time 1609545600
committer-tz +0000
summary Add second line
filename src/index.ts
\tconsole.log(hello);`;

      mockExecGit.mockResolvedValueOnce({
        stdout: porcelainOutput,
        stderr: '',
      });

      const result = await executeBlame(
        { file: 'src/index.ts' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.file).toBe('src/index.ts');
      expect(result.totalLines).toBe(2);
      expect(result.lines).toHaveLength(2);

      expect(result.lines[0]!.commitHash).toBe(
        'abc123def456789012345678901234567890abcd',
      );
      expect(result.lines[0]!.lineNumber).toBe(1);
      expect(result.lines[0]!.author).toBe('John Doe');
      expect(result.lines[0]!.timestamp).toBe(1609459200);
      expect(result.lines[0]!.content).toBe("const hello = 'world';");

      expect(result.lines[1]!.commitHash).toBe(
        'def456789012345678901234567890abcdef012345',
      );
      expect(result.lines[1]!.lineNumber).toBe(2);
      expect(result.lines[1]!.author).toBe('Jane Smith');
      expect(result.lines[1]!.timestamp).toBe(1609545600);
      expect(result.lines[1]!.content).toBe('console.log(hello);');
    });

    it('returns empty lines for empty file', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeBlame(
        { file: 'empty.txt' },
        mockContext,
        mockExecGit,
      );

      expect(result.success).toBe(true);
      expect(result.file).toBe('empty.txt');
      expect(result.lines).toHaveLength(0);
      expect(result.totalLines).toBe(0);
    });
  });

  describe('line range option', () => {
    it('adds -L flag with start and end line', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeBlame(
        { file: 'src/index.ts', startLine: 10, endLine: 20 },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-L10,20');
    });

    it('does not add -L flag when only startLine is provided', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeBlame(
        { file: 'src/index.ts', startLine: 10 },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      const hasLFlag = args.some((a: string) => a.startsWith('-L'));
      expect(hasLFlag).toBe(false);
    });

    it('starts line numbers from specified startLine', async () => {
      const porcelainOutput = `abc123def456789012345678901234567890abcd 5 5 1
author John Doe
author-mail <john@example.com>
author-time 1609459200
author-tz +0000
committer John Doe
committer-mail <john@example.com>
committer-time 1609459200
committer-tz +0000
summary Initial commit
filename src/index.ts
\tline content here`;

      mockExecGit.mockResolvedValueOnce({
        stdout: porcelainOutput,
        stderr: '',
      });

      const result = await executeBlame(
        { file: 'src/index.ts', startLine: 5, endLine: 5 },
        mockContext,
        mockExecGit,
      );

      expect(result.lines[0]!.lineNumber).toBe(5);
    });
  });

  describe('ignoreWhitespace option', () => {
    it('adds -w flag when ignoreWhitespace is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeBlame(
        { file: 'src/index.ts', ignoreWhitespace: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-w');
    });

    it('does not add -w flag when ignoreWhitespace is false', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeBlame(
        { file: 'src/index.ts', ignoreWhitespace: false },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).not.toContain('-w');
    });
  });

  describe('argument ordering', () => {
    it('places -- separator before file path', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeBlame({ file: 'src/file.ts' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      const dashDashIdx = args.indexOf('--');
      const fileIdx = args.indexOf('src/file.ts');
      expect(dashDashIdx).toBeGreaterThan(-1);
      expect(fileIdx).toBe(dashDashIdx + 1);
    });

    it('places -w before -- separator', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeBlame(
        { file: 'src/file.ts', ignoreWhitespace: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      const wIdx = args.indexOf('-w');
      const dashDashIdx = args.indexOf('--');
      expect(wIdx).toBeLessThan(dashDashIdx);
    });
  });

  describe('result structure', () => {
    it('returns correct result structure', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeBlame(
        { file: 'test.txt' },
        mockContext,
        mockExecGit,
      );

      expect(result).toEqual({
        success: true,
        file: 'test.txt',
        lines: [],
        totalLines: 0,
      });
    });
  });
});
