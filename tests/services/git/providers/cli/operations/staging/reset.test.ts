/**
 * @fileoverview Unit tests for git reset operation
 * @module tests/services/git/providers/cli/operations/staging/reset.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeReset } from '@/services/git/providers/cli/operations/staging/reset.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

type ExecGitFn = (
  args: string[],
  cwd: string,
  ctx: RequestContext,
  options?: { allowNonZeroExit?: boolean },
) => Promise<{ stdout: string; stderr: string; exitCode?: number }>;

describe('executeReset', () => {
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

  /**
   * Stub the standard pre/post HEAD lookup performed by executeReset.
   * Pass `before` and `after` hashes; subsequent mock-call sequence is:
   *   1) rev-parse HEAD (before)
   *   2) reset
   *   3) rev-parse HEAD (after)
   *   4) (optional) diff --name-only OLD..NEW
   */
  function mockHeads(
    before: string,
    after: string,
    diffFiles: string[] = [],
  ): void {
    mockExecGit
      .mockResolvedValueOnce({ stdout: `${before}\n`, stderr: '', exitCode: 0 }) // pre rev-parse
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // reset
      .mockResolvedValueOnce({ stdout: `${after}\n`, stderr: '', exitCode: 0 }); // post rev-parse
    if (before !== after) {
      mockExecGit.mockResolvedValueOnce({
        stdout: diffFiles.join('\n'),
        stderr: '',
        exitCode: 0,
      });
    }
  }

  describe('mode flags', () => {
    it.each([
      ['soft', '--soft'],
      ['mixed', '--mixed'],
      ['hard', '--hard'],
      ['merge', '--merge'],
      ['keep', '--keep'],
    ] as const)('passes %s flag', async (mode, flag) => {
      mockHeads('abc123', 'abc123');
      // hard mode triggers an extra dirtyBefore call inserted before the reset
      if (mode === 'hard') {
        mockExecGit.mockReset();
        mockExecGit
          .mockResolvedValueOnce({
            stdout: 'abc123\n',
            stderr: '',
            exitCode: 0,
          }) // rev-parse before
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // dirty list
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // reset
          .mockResolvedValueOnce({
            stdout: 'abc123\n',
            stderr: '',
            exitCode: 0,
          }); // rev-parse after
      }

      const result = await executeReset({ mode }, mockContext, mockExecGit);

      expect(result.mode).toBe(mode);
      const resetCall = mockExecGit.mock.calls.find((c) =>
        c[0].includes('reset'),
      );
      expect(resetCall?.[0]).toContain(flag);
    });
  });

  describe('with commit ref', () => {
    it('places mode flag before commit ref', async () => {
      mockHeads('old123', 'new456', []);

      await executeReset(
        { mode: 'soft', commit: 'HEAD~3' },
        mockContext,
        mockExecGit,
      );

      const resetCall = mockExecGit.mock.calls.find((c) =>
        c[0].includes('reset'),
      )!;
      const args = resetCall[0];
      expect(args).toContain('HEAD~3');
      expect(args.indexOf('--soft')).toBeLessThan(args.indexOf('HEAD~3'));
    });
  });

  describe('with paths', () => {
    it('returns paths as filesReset and includes -- separator', async () => {
      mockHeads('abc123', 'abc123');

      const result = await executeReset(
        { mode: 'mixed', paths: ['src/index.ts', 'src/utils.ts'] },
        mockContext,
        mockExecGit,
      );

      expect(result.filesReset).toEqual(['src/index.ts', 'src/utils.ts']);
      const resetCall = mockExecGit.mock.calls.find((c) =>
        c[0].includes('reset'),
      )!;
      const dashDashIdx = resetCall[0].indexOf('--');
      expect(dashDashIdx).toBeGreaterThan(-1);
      expect(resetCall[0][dashDashIdx + 1]).toBe('src/index.ts');
      expect(resetCall[0][dashDashIdx + 2]).toBe('src/utils.ts');
    });
  });

  describe('reports what changed', () => {
    it('returns diff between old and new HEAD when HEAD moved', async () => {
      mockHeads('OLDHASH', 'NEWHASH', ['src/foo.ts', 'README.md']);

      const result = await executeReset(
        { mode: 'mixed', commit: 'HEAD~1' },
        mockContext,
        mockExecGit,
      );

      expect(result.commit).toBe('NEWHASH');
      expect(result.previousCommit).toBe('OLDHASH');
      expect(result.filesReset).toEqual(['src/foo.ts', 'README.md']);
    });

    it('omits previousCommit when HEAD did not move', async () => {
      mockHeads('SAMEHASH', 'SAMEHASH');

      const result = await executeReset(
        { mode: 'mixed' },
        mockContext,
        mockExecGit,
      );

      expect(result.commit).toBe('SAMEHASH');
      expect(result.previousCommit).toBeUndefined();
      expect(result.filesReset).toEqual([]);
    });

    it('reports discarded dirty files for --hard with no HEAD move', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'CURRENT\n', stderr: '', exitCode: 0 }) // pre rev-parse
        .mockResolvedValueOnce({
          stdout: ' M README.md\nA  new.ts\n',
          stderr: '',
          exitCode: 0,
        }) // dirty list (porcelain v1)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // reset
        .mockResolvedValueOnce({
          stdout: 'CURRENT\n',
          stderr: '',
          exitCode: 0,
        }); // post rev-parse

      const result = await executeReset(
        { mode: 'hard' },
        mockContext,
        mockExecGit,
      );

      expect(result.filesReset).toEqual(['README.md', 'new.ts']);
      expect(result.previousCommit).toBeUndefined();
    });

    it('combines paths with diff for path-specific reset', async () => {
      mockHeads('OLDHASH', 'OLDHASH'); // path-only resets do not move HEAD

      const result = await executeReset(
        { mode: 'mixed', paths: ['only.ts'] },
        mockContext,
        mockExecGit,
      );

      expect(result.filesReset).toEqual(['only.ts']);
    });

    it('deduplicates files in the affected set', async () => {
      mockHeads('OLDHASH', 'NEWHASH', ['shared.ts', 'shared.ts']);

      const result = await executeReset(
        { mode: 'mixed', commit: 'HEAD~1' },
        mockContext,
        mockExecGit,
      );

      expect(result.filesReset).toEqual(['shared.ts']);
    });
  });

  describe('rev-parse handling', () => {
    it('trims whitespace from commit hashes', async () => {
      mockHeads('  oldhash  ', '  newhash  ', ['x.ts']);

      const result = await executeReset(
        { mode: 'soft', commit: 'HEAD~1' },
        mockContext,
        mockExecGit,
      );

      expect(result.commit).toBe('newhash');
      expect(result.previousCommit).toBe('oldhash');
    });

    it('degrades gracefully when rev-parse exits non-zero (empty repo)', async () => {
      mockExecGit
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'fatal: ...',
          exitCode: 128,
        }) // pre rev-parse
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // reset
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'fatal: ...',
          exitCode: 128,
        }); // post rev-parse

      const result = await executeReset(
        { mode: 'soft' },
        mockContext,
        mockExecGit,
      );

      expect(result.commit).toBe('');
      expect(result.previousCommit).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('throws mapped git error on reset failure', async () => {
      mockExecGit
        .mockResolvedValueOnce({ stdout: 'abc\n', stderr: '', exitCode: 0 }) // pre rev-parse
        .mockRejectedValueOnce(new Error('fatal: ambiguous argument'));

      await expect(
        executeReset(
          { mode: 'hard', commit: 'nonexistent' },
          mockContext,
          mockExecGit,
        ),
      ).rejects.toThrow();
    });
  });
});
