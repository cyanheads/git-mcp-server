/**
 * @fileoverview Unit tests for git-worktree tool
 * @module tests/mcp-server/tools/definitions/unit/git-worktree.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitWorktreeTool } from '@/mcp-server/tools/definitions/git-worktree.tool.js';
import {
  GitProviderFactory as GitProviderFactoryToken,
  StorageService as StorageServiceToken,
} from '@/container/tokens.js';
import {
  createTestContext,
  createTestSdkContext,
  createMockGitProvider,
  createMockStorageService,
  assertJsonContent,
  assertJsonField,
  parseJsonContent,
  assertProviderCalledWithContext,
  assertLlmFriendlyFormat,
} from '../helpers/index.js';
import type { GitWorktreeResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_worktree tool', () => {
  const mockProvider = createMockGitProvider();
  const mockStorage = createMockStorageService();
  const mockFactory = {
    getProvider: vi.fn(async () => mockProvider),
  } as unknown as GitProviderFactory;

  beforeEach(() => {
    mockProvider.resetMocks();
    mockStorage.clearAll();

    container.clearInstances();
    container.register(GitProviderFactoryToken, { useValue: mockFactory });
    container.register(StorageServiceToken, { useValue: mockStorage });

    const tenantId = 'test-tenant';
    const context = createTestContext({ tenantId });
    mockStorage.set(`session:workingDir:${tenantId}`, '/test/repo', context);
  });

  describe('Input Schema', () => {
    it('validates correct input with defaults', () => {
      const input = { path: '.' };
      const result = gitWorktreeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('list');
        expect(result.data.force).toBe(false);
        expect(result.data.detach).toBe(false);
        expect(result.data.verbose).toBe(false);
        expect(result.data.dryRun).toBe(false);
      }
    });

    it('accepts add mode with worktree path and branch', () => {
      const input = {
        path: '.',
        mode: 'add',
        worktreePath: '/tmp/worktree',
        branch: 'feature-branch',
      };
      const result = gitWorktreeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('add');
        expect(result.data.worktreePath).toBe('/tmp/worktree');
        expect(result.data.branch).toBe('feature-branch');
      }
    });

    it('accepts remove mode with worktree path', () => {
      const input = {
        path: '.',
        mode: 'remove',
        worktreePath: '/tmp/worktree',
      };
      const result = gitWorktreeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts move mode with worktree path and new path', () => {
      const input = {
        path: '.',
        mode: 'move',
        worktreePath: '/tmp/old-path',
        newPath: '/tmp/new-path',
      };
      const result = gitWorktreeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newPath).toBe('/tmp/new-path');
      }
    });

    it('accepts prune mode with dryRun', () => {
      const input = { path: '.', mode: 'prune', dryRun: true };
      const result = gitWorktreeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dryRun).toBe(true);
      }
    });

    it('rejects invalid mode', () => {
      const input = { path: '.', mode: 'invalid' };
      const result = gitWorktreeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid path type', () => {
      const input = { path: 123 };
      const result = gitWorktreeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic - List Operation', () => {
    it('lists worktrees successfully', async () => {
      const mockResult: GitWorktreeResult = {
        mode: 'list',
        worktrees: [
          {
            path: '/test/repo',
            head: 'abc123',
            branch: 'main',
            bare: false,
            detached: false,
            locked: false,
            prunable: false,
          },
          {
            path: '/tmp/worktree',
            head: 'def456',
            branch: 'feature',
            bare: false,
            detached: false,
            locked: false,
            prunable: false,
          },
        ],
      };

      mockProvider.worktree.mockResolvedValue(mockResult);

      const parsedInput = gitWorktreeTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitWorktreeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.worktree).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.worktree.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('list');
      expect(result.worktrees).toHaveLength(2);
      expect(result.worktrees![0]!.path).toBe('/test/repo');
    });
  });

  describe('Tool Logic - Add Operation', () => {
    it('adds worktree successfully', async () => {
      const mockResult: GitWorktreeResult = {
        mode: 'add',
        added: '/tmp/new-worktree',
      };

      mockProvider.worktree.mockResolvedValue(mockResult);

      const parsedInput = gitWorktreeTool.inputSchema.parse({
        path: '.',
        mode: 'add',
        worktreePath: '/tmp/new-worktree',
        branch: 'feature',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitWorktreeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.worktree).toHaveBeenCalledTimes(1);
      const [worktreeOptions] = mockProvider.worktree.mock.calls[0]!;
      expect(worktreeOptions.mode).toBe('add');
      expect(worktreeOptions.path).toBe('/tmp/new-worktree');
      expect(worktreeOptions.branch).toBe('feature');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('add');
      expect(result.added).toBe('/tmp/new-worktree');
    });

    it('passes detach option to provider', async () => {
      const mockResult: GitWorktreeResult = {
        mode: 'add',
        added: '/tmp/detached-worktree',
      };

      mockProvider.worktree.mockResolvedValue(mockResult);

      const parsedInput = gitWorktreeTool.inputSchema.parse({
        path: '.',
        mode: 'add',
        worktreePath: '/tmp/detached-worktree',
        detach: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitWorktreeTool.logic(parsedInput, appContext, sdkContext);

      const [worktreeOptions] = mockProvider.worktree.mock.calls[0]!;
      expect(worktreeOptions.detach).toBe(true);
    });
  });

  describe('Tool Logic - Remove Operation', () => {
    it('removes worktree successfully', async () => {
      const mockResult: GitWorktreeResult = {
        mode: 'remove',
        removed: '/tmp/old-worktree',
      };

      mockProvider.worktree.mockResolvedValue(mockResult);

      const parsedInput = gitWorktreeTool.inputSchema.parse({
        path: '.',
        mode: 'remove',
        worktreePath: '/tmp/old-worktree',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitWorktreeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('remove');
      expect(result.removed).toBe('/tmp/old-worktree');
    });
  });

  describe('Tool Logic - Move Operation', () => {
    it('moves worktree successfully', async () => {
      const mockResult: GitWorktreeResult = {
        mode: 'move',
        moved: { from: '/tmp/old-path', to: '/tmp/new-path' },
      };

      mockProvider.worktree.mockResolvedValue(mockResult);

      const parsedInput = gitWorktreeTool.inputSchema.parse({
        path: '.',
        mode: 'move',
        worktreePath: '/tmp/old-path',
        newPath: '/tmp/new-path',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitWorktreeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('move');
      expect(result.moved).toEqual({
        from: '/tmp/old-path',
        to: '/tmp/new-path',
      });
    });
  });

  describe('Response Formatter', () => {
    it('formats worktree list correctly', () => {
      const result = {
        success: true,
        mode: 'list',
        worktrees: [
          {
            path: '/test/repo',
            head: 'abc123',
            branch: 'main',
            bare: false,
            detached: false,
            locked: false,
            prunable: false,
          },
        ],
        added: undefined,
        removed: undefined,
        moved: undefined,
        pruned: undefined,
      };

      const content = gitWorktreeTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'list',
      });

      const parsed = parseJsonContent(content) as {
        worktrees: Array<{ path: string; branch: string }>;
      };

      expect(parsed.worktrees).toHaveLength(1);
      expect(parsed.worktrees[0]!.path).toBe('/test/repo');

      assertLlmFriendlyFormat(content);
    });

    it('formats add result correctly', () => {
      const result = {
        success: true,
        mode: 'add',
        worktrees: undefined,
        added: '/tmp/new-worktree',
        removed: undefined,
        moved: undefined,
        pruned: undefined,
      };

      const content = gitWorktreeTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'add',
      });

      assertJsonField(content, 'added', '/tmp/new-worktree');
    });

    it('formats move result correctly', () => {
      const result = {
        success: true,
        mode: 'move',
        worktrees: undefined,
        added: undefined,
        removed: undefined,
        moved: { from: '/tmp/old', to: '/tmp/new' },
        pruned: undefined,
      };

      const content = gitWorktreeTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'move',
      });

      assertJsonField(content, 'moved', { from: '/tmp/old', to: '/tmp/new' });
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitWorktreeTool.name).toBe('git_worktree');
    });

    it('is marked as write operation', () => {
      expect(gitWorktreeTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitWorktreeTool.title).toBe('Git Worktree');
      expect(gitWorktreeTool.description).toBeTruthy();
      expect(gitWorktreeTool.description.toLowerCase()).toContain('worktree');
    });

    it('has valid input and output schemas', () => {
      expect(gitWorktreeTool.inputSchema).toBeDefined();
      expect(gitWorktreeTool.outputSchema).toBeDefined();

      const inputShape = gitWorktreeTool.inputSchema.shape;
      expect(inputShape.mode).toBeDefined();
      expect(inputShape.worktreePath).toBeDefined();

      const outputShape = gitWorktreeTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.mode).toBeDefined();
    });
  });
});
