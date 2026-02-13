/**
 * @fileoverview Unit tests for git reflog operation
 * @module tests/services/git/providers/cli/operations/history/reflog.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeReflog } from '@/services/git/providers/cli/operations/history/reflog.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
) => Promise<{ stdout: string; stderr: string }>;

// Match the delimiters from output-parser.ts
const FIELD_DELIMITER = '\x1F';
const RECORD_DELIMITER = '\x1E';

/**
 * Helper to build mock reflog output with proper delimiters.
 */
function buildReflogOutput(
  entries: Array<{
    hash: string;
    refName: string;
    message: string;
    timestamp: number;
  }>,
): string {
  return entries
    .map(
      (e) =>
        `${e.hash}${FIELD_DELIMITER}${e.refName}${FIELD_DELIMITER}${e.message}${FIELD_DELIMITER}${e.timestamp}${RECORD_DELIMITER}`,
    )
    .join('\n');
}

describe('executeReflog', () => {
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

  describe('basic reflog operations', () => {
    it('runs reflog with custom format for HEAD by default', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeReflog({}, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('reflog');
      // Verify the format string includes the delimiters
      const formatArg = args.find((a: string) => a.startsWith('--format='));
      expect(formatArg).toBeDefined();
      expect(formatArg).toContain('%H');
      expect(formatArg).toContain('%gd');
      expect(formatArg).toContain('%gs');
      expect(formatArg).toContain('%ct');
      // Default ref is HEAD
      expect(args).toContain('HEAD');
      expect(result.ref).toBe('HEAD');
    });

    it('parses reflog entries correctly', async () => {
      const output = buildReflogOutput([
        {
          hash: 'abc123def456789012345678901234567890abcd',
          refName: 'HEAD@{0}',
          message: 'commit: add new feature',
          timestamp: 1609459200,
        },
        {
          hash: 'def456789012345678901234567890abcdef0123',
          refName: 'HEAD@{1}',
          message: 'checkout: moving from main to feature',
          timestamp: 1609372800,
        },
      ]);

      mockExecGit.mockResolvedValueOnce({
        stdout: output,
        stderr: '',
      });

      const result = await executeReflog({}, mockContext, mockExecGit);

      expect(result.success).toBe(true);
      expect(result.entries).toHaveLength(2);
      expect(result.totalEntries).toBe(2);

      expect(result.entries[0]!.hash).toBe(
        'abc123def456789012345678901234567890abcd',
      );
      expect(result.entries[0]!.refName).toBe('HEAD@{0}');
      expect(result.entries[0]!.action).toBe('0');
      expect(result.entries[0]!.message).toBe('commit: add new feature');
      expect(result.entries[0]!.timestamp).toBe(1609459200);

      expect(result.entries[1]!.hash).toBe(
        'def456789012345678901234567890abcdef0123',
      );
      expect(result.entries[1]!.refName).toBe('HEAD@{1}');
      expect(result.entries[1]!.action).toBe('1');
      expect(result.entries[1]!.message).toBe(
        'checkout: moving from main to feature',
      );
    });

    it('returns empty entries for empty reflog', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeReflog({}, mockContext, mockExecGit);

      expect(result.entries).toHaveLength(0);
      expect(result.totalEntries).toBe(0);
    });
  });

  describe('custom ref option', () => {
    it('uses specified ref instead of HEAD', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeReflog(
        { ref: 'main' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('main');
      expect(args).not.toContain('HEAD');
      expect(result.ref).toBe('main');
    });

    it('uses feature branch as ref', async () => {
      const output = buildReflogOutput([
        {
          hash: 'abc123def456789012345678901234567890abcd',
          refName: 'feature@{0}',
          message: 'commit: wip',
          timestamp: 1609459200,
        },
      ]);

      mockExecGit.mockResolvedValueOnce({
        stdout: output,
        stderr: '',
      });

      const result = await executeReflog(
        { ref: 'feature' },
        mockContext,
        mockExecGit,
      );

      expect(result.ref).toBe('feature');
      expect(result.entries[0]!.refName).toBe('feature@{0}');
    });
  });

  describe('maxCount option', () => {
    it('adds -n flag with maxCount value', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeReflog({ maxCount: 5 }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      expect(args).toContain('-n5');
    });

    it('does not add -n flag when maxCount is not specified', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeReflog({}, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0]!;
      const hasNFlag = args.some((a: string) => a.startsWith('-n'));
      expect(hasNFlag).toBe(false);
    });
  });

  describe('action parsing', () => {
    it('extracts action from refName with curly braces', async () => {
      const output = buildReflogOutput([
        {
          hash: 'abc123def456789012345678901234567890abcd',
          refName: 'HEAD@{0}',
          message: 'commit: test',
          timestamp: 1609459200,
        },
        {
          hash: 'def456789012345678901234567890abcdef0123',
          refName: 'HEAD@{5}',
          message: 'reset: moving to HEAD~1',
          timestamp: 1609372800,
        },
      ]);

      mockExecGit.mockResolvedValueOnce({
        stdout: output,
        stderr: '',
      });

      const result = await executeReflog({}, mockContext, mockExecGit);

      expect(result.entries[0]!.action).toBe('0');
      expect(result.entries[1]!.action).toBe('5');
    });
  });

  describe('result structure', () => {
    it('returns correct result structure', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeReflog({}, mockContext, mockExecGit);

      expect(result).toEqual({
        success: true,
        ref: 'HEAD',
        entries: [],
        totalEntries: 0,
      });
    });

    it('returns correct totalEntries count', async () => {
      const output = buildReflogOutput([
        {
          hash: 'aaa',
          refName: 'HEAD@{0}',
          message: 'commit: first',
          timestamp: 1000,
        },
        {
          hash: 'bbb',
          refName: 'HEAD@{1}',
          message: 'commit: second',
          timestamp: 2000,
        },
        {
          hash: 'ccc',
          refName: 'HEAD@{2}',
          message: 'commit: third',
          timestamp: 3000,
        },
      ]);

      mockExecGit.mockResolvedValueOnce({
        stdout: output,
        stderr: '',
      });

      const result = await executeReflog({}, mockContext, mockExecGit);

      expect(result.totalEntries).toBe(3);
    });
  });
});
