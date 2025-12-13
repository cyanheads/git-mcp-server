/**
 * @fileoverview Unit tests for git checkout operation
 * @module tests/services/git/providers/cli/operations/branches/checkout.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { executeCheckout } from '@/services/git/providers/cli/operations/branches/checkout.js';
import type {
  GitCheckoutOptions,
  GitOperationContext,
} from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

describe('executeCheckout', () => {
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

  describe('basic checkout operations', () => {
    it('checks out existing branch', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: "Switched to branch 'main'\n",
        stderr: '',
      });

      const result = await executeCheckout(
        { target: 'main' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('checkout');
      expect(args).toContain('main');
      expect(result.success).toBe(true);
      expect(result.target).toBe('main');
      expect(result.branchCreated).toBe(false);
    });

    it('checks out commit hash', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeCheckout(
        { target: 'abc123def' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('abc123def');
      expect(result.target).toBe('abc123def');
    });

    it('checks out tag', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeCheckout(
        { target: 'v1.0.0' },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('v1.0.0');
      expect(result.target).toBe('v1.0.0');
    });
  });

  describe('createBranch option', () => {
    it('creates new branch with -b flag', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: "Switched to a new branch 'feature-x'\n",
        stderr: '',
      });

      const result = await executeCheckout(
        { target: 'feature-x', createBranch: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('-b');
      expect(args).toContain('feature-x');
      expect(result.branchCreated).toBe(true);
    });

    it('does not add -b flag when createBranch is false', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'existing-branch', createBranch: false },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).not.toContain('-b');
    });

    it('does not add -b flag when createBranch is undefined', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout({ target: 'branch' }, mockContext, mockExecGit);

      const [args] = mockExecGit.mock.calls[0];
      expect(args).not.toContain('-b');
    });
  });

  describe('track option', () => {
    it('adds --track flag when creating branch with track', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'feature', createBranch: true, track: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('-b');
      expect(args).toContain('--track');
      expect(args).toContain('feature');
    });

    it('does not add --track when createBranch is false', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'branch', track: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).not.toContain('--track');
    });

    it('does not add --track when track is false', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'feature', createBranch: true, track: false },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('-b');
      expect(args).not.toContain('--track');
    });

    it('order: -b comes before branch name, --track after', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'new-branch', createBranch: true, track: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      const bIdx = args.indexOf('-b');
      const branchIdx = args.indexOf('new-branch');
      const trackIdx = args.indexOf('--track');

      // -b should come before branch name
      expect(bIdx).toBeLessThan(branchIdx);
      // --track can come after
      expect(trackIdx).toBeGreaterThan(bIdx);
    });
  });

  describe('force option', () => {
    it('adds --force flag when force is true', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'branch', force: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('--force');
    });

    it('does not add --force when force is false', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'branch', force: false },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).not.toContain('--force');
    });
  });

  describe('paths option', () => {
    it('adds paths with -- separator', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'HEAD', paths: ['file1.txt', 'file2.txt'] },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      const dashDashIdx = args.indexOf('--');
      expect(dashDashIdx).toBeGreaterThan(-1);
      expect(args).toContain('file1.txt');
      expect(args).toContain('file2.txt');
    });

    it('does not add -- separator when paths is empty', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'branch', paths: [] },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).not.toContain('--');
    });

    it('restores specific files from HEAD', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'HEAD', paths: ['src/modified.ts'] },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('HEAD');
      expect(args).toContain('--');
      expect(args).toContain('src/modified.ts');
    });
  });

  describe('filesModified parsing', () => {
    it('extracts modified files from output', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: `Updated 2 paths from the index
file1.txt
file2.txt`,
        stderr: '',
      });

      const result = await executeCheckout(
        { target: 'HEAD', paths: ['file1.txt', 'file2.txt'] },
        mockContext,
        mockExecGit,
      );

      // Note: the current implementation filters out lines starting with
      // 'Switched' and 'Already', but not 'Updated'
      expect(result.filesModified).toContain('file1.txt');
      expect(result.filesModified).toContain('file2.txt');
    });

    it('returns empty array when no files modified', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: "Switched to branch 'main'\n",
        stderr: '',
      });

      const result = await executeCheckout(
        { target: 'main' },
        mockContext,
        mockExecGit,
      );

      expect(result.filesModified).toEqual([]);
    });

    it('filters out "Switched to" messages', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: "Switched to branch 'feature'\nSwitched to a new branch 'test'",
        stderr: '',
      });

      const result = await executeCheckout(
        { target: 'feature' },
        mockContext,
        mockExecGit,
      );

      expect(result.filesModified).toEqual([]);
    });

    it('filters out "Already on" messages', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: "Already on 'main'\n",
        stderr: '',
      });

      const result = await executeCheckout(
        { target: 'main' },
        mockContext,
        mockExecGit,
      );

      expect(result.filesModified).toEqual([]);
    });
  });

  describe('combined options', () => {
    it('handles createBranch + track + force', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'new-feature', createBranch: true, track: true, force: true },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('-b');
      expect(args).toContain('--track');
      expect(args).toContain('--force');
      expect(args).toContain('new-feature');
    });

    it('handles force + paths for restoring files', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      await executeCheckout(
        { target: 'HEAD~1', force: true, paths: ['config.json'] },
        mockContext,
        mockExecGit,
      );

      const [args] = mockExecGit.mock.calls[0];
      expect(args).toContain('HEAD~1');
      expect(args).toContain('--force');
      expect(args).toContain('--');
      expect(args).toContain('config.json');
    });
  });

  describe('result structure', () => {
    it('returns correct structure for branch switch', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeCheckout(
        { target: 'develop' },
        mockContext,
        mockExecGit,
      );

      expect(result).toEqual({
        success: true,
        target: 'develop',
        branchCreated: false,
        filesModified: [],
      });
    });

    it('returns correct structure for branch creation', async () => {
      mockExecGit.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

      const result = await executeCheckout(
        { target: 'new-branch', createBranch: true },
        mockContext,
        mockExecGit,
      );

      expect(result).toEqual({
        success: true,
        target: 'new-branch',
        branchCreated: true,
        filesModified: [],
      });
    });
  });
});
