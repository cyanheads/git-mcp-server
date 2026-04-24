/**
 * @fileoverview Unit tests for git-branch tool
 * @module tests/mcp-server/tools/definitions/unit/git-branch.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitBranchTool } from '@/mcp-server/tools/definitions/git-branch.tool.js';
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
  assertLlmFriendlyFormat,
} from '../helpers/index.js';
import type { GitBranchResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_branch tool', () => {
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
    it('validates list operation with defaults', () => {
      const input = { path: '.' };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe('list');
        expect(result.data.force).toBe(false);
        expect(result.data.all).toBe(false);
        expect(result.data.remote).toBe(false);
      }
    });

    it('accepts create operation with branch name', () => {
      const input = { path: '.', operation: 'create', name: 'feature-branch' };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe('create');
        expect(result.data.name).toBe('feature-branch');
      }
    });

    it('accepts delete operation', () => {
      const input = { path: '.', operation: 'delete', name: 'old-branch' };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts rename operation with newName', () => {
      const input = {
        path: '.',
        operation: 'rename',
        name: 'old-name',
        newName: 'new-name',
      };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newName).toBe('new-name');
      }
    });

    it('accepts show-current operation', () => {
      const input = { path: '.', operation: 'show-current' };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('coerces string "true" to boolean true for merged', () => {
      const input = { path: '.', merged: 'true' as unknown as boolean };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.merged).toBe(true);
      }
    });

    it('coerces string "false" to boolean false for merged', () => {
      const input = { path: '.', merged: 'false' as unknown as boolean };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.merged).toBe(false);
      }
    });

    it('coerces string "true" to boolean true for noMerged', () => {
      const input = { path: '.', noMerged: 'true' as unknown as boolean };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.noMerged).toBe(true);
      }
    });

    it('coerces string "false" to boolean false for noMerged', () => {
      const input = { path: '.', noMerged: 'false' as unknown as boolean };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.noMerged).toBe(false);
      }
    });

    it('preserves string ref values for merged', () => {
      const input = { path: '.', merged: 'develop' };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.merged).toBe('develop');
      }
    });

    it('preserves boolean values for merged', () => {
      const input = { path: '.', merged: true };
      const result = gitBranchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.merged).toBe(true);
      }
    });
  });

  describe('Tool Logic - List Operation', () => {
    it('lists branches successfully', async () => {
      const mockResult: GitBranchResult = {
        mode: 'list',
        branches: [
          {
            name: 'main',
            current: true,
            commitHash: 'abc123',
            upstream: 'origin/main',
            ahead: 0,
            behind: 0,
          },
          {
            name: 'feature',
            current: false,
            commitHash: 'def456',
          },
        ],
      };

      mockProvider.branch.mockResolvedValue(mockResult);

      const parsedInput = gitBranchTool.inputSchema.parse({
        path: '.',
        operation: 'list',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitBranchTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.branch).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.operation).toBe('list');
      expect(result.branches).toHaveLength(2);
      expect(result.currentBranch).toBe('main');
    });

    it('passes all flag to provider', async () => {
      const mockResult: GitBranchResult = {
        mode: 'list',
        branches: [],
      };

      mockProvider.branch.mockResolvedValue(mockResult);

      const parsedInput = gitBranchTool.inputSchema.parse({
        path: '.',
        operation: 'list',
        all: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitBranchTool.logic(parsedInput, appContext, sdkContext);

      const [branchOptions] = mockProvider.branch.mock.calls[0]!;
      expect(branchOptions.all).toBe(true);
    });
  });

  describe('Tool Logic - Create Operation', () => {
    it('creates branch successfully', async () => {
      const mockResult: GitBranchResult = {
        mode: 'create',
        created: 'feature-branch',
      };

      mockProvider.branch.mockResolvedValue(mockResult);

      const parsedInput = gitBranchTool.inputSchema.parse({
        path: '.',
        operation: 'create',
        name: 'feature-branch',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitBranchTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.operation).toBe('create');
      expect(result.message).toContain('feature-branch');
      expect(result.message).toContain('created');
    });
  });

  describe('Tool Logic - Delete Operation', () => {
    it('deletes branch successfully', async () => {
      const mockResult: GitBranchResult = {
        mode: 'delete',
        deleted: 'old-branch',
      };

      mockProvider.branch.mockResolvedValue(mockResult);

      const parsedInput = gitBranchTool.inputSchema.parse({
        path: '.',
        operation: 'delete',
        name: 'old-branch',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitBranchTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.operation).toBe('delete');
      expect(result.message).toContain('old-branch');
      expect(result.message).toContain('deleted');
    });
  });

  describe('Tool Logic - show-current operation', () => {
    it('calls provider with mode show-current (cheap path)', async () => {
      mockProvider.branch.mockResolvedValue({
        mode: 'show-current',
        current: 'main',
      });

      const parsedInput = gitBranchTool.inputSchema.parse({
        path: '.',
        operation: 'show-current',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitBranchTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      const [opts] = mockProvider.branch.mock.calls[0]!;
      expect(opts).toEqual({ mode: 'show-current' });
      expect(result.operation).toBe('show-current');
      expect(result.currentBranch).toBe('main');
      expect(result.message).toContain('main');
    });

    it('reports detached HEAD when provider returns null current', async () => {
      mockProvider.branch.mockResolvedValue({
        mode: 'show-current',
        current: null,
      });

      const parsedInput = gitBranchTool.inputSchema.parse({
        path: '.',
        operation: 'show-current',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitBranchTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.currentBranch).toBeUndefined();
      expect(result.message).toContain('detached HEAD');
    });
  });

  describe('Tool Logic - list limit', () => {
    it('passes limit through to provider.branch', async () => {
      mockProvider.branch.mockResolvedValue({ mode: 'list', branches: [] });

      const parsedInput = gitBranchTool.inputSchema.parse({
        path: '.',
        operation: 'list',
        limit: 10,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitBranchTool.logic(parsedInput, appContext, sdkContext);

      const [opts] = mockProvider.branch.mock.calls[0]!;
      expect(opts.limit).toBe(10);
    });
  });

  describe('Tool Logic - Rename Operation', () => {
    it('renames branch successfully', async () => {
      const mockResult: GitBranchResult = {
        mode: 'rename',
        renamed: { from: 'old-name', to: 'new-name' },
      };

      mockProvider.branch.mockResolvedValue(mockResult);

      const parsedInput = gitBranchTool.inputSchema.parse({
        path: '.',
        operation: 'rename',
        name: 'old-name',
        newName: 'new-name',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitBranchTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.operation).toBe('rename');
      expect(result.message).toContain('old-name');
      expect(result.message).toContain('new-name');
    });
  });

  describe('Response Formatter', () => {
    it('formats branch list with current branch', () => {
      const result = {
        success: true,
        operation: 'list' as const,
        branches: [
          {
            name: 'main',
            current: true,
            commitHash: 'abc123',
            upstream: 'origin/main',
            ahead: 2,
            behind: 1,
          },
          {
            name: 'develop',
            current: false,
            commitHash: 'def456',
          },
        ],
        currentBranch: 'main',
        message: undefined,
      };

      const content = gitBranchTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        operation: 'list',
        currentBranch: 'main',
      });

      assertJsonField(content, 'currentBranch', 'main');
      assertJsonField(content, 'operation', 'list');

      const parsed = parseJsonContent(content) as {
        branches: Array<{ name: string; current: boolean }>;
      };

      expect(parsed.branches).toHaveLength(2);
      expect(parsed.branches[0]!.name).toBe('main');
      expect(parsed.branches[0]!.current).toBe(true);
      expect(parsed.branches[1]!.name).toBe('develop');

      assertLlmFriendlyFormat(content);
    });

    it('formats create operation result', () => {
      const result = {
        success: true,
        operation: 'create' as const,
        branches: undefined,
        currentBranch: undefined,
        message: "Branch 'feature-x' created successfully.",
      };

      const content = gitBranchTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        operation: 'create',
      });

      assertJsonField(content, 'operation', 'create');
      assertJsonField(
        content,
        'message',
        "Branch 'feature-x' created successfully.",
      );
    });

    it('formats delete operation result', () => {
      const result = {
        success: true,
        operation: 'delete' as const,
        branches: undefined,
        currentBranch: undefined,
        message: "Branch 'old-branch' deleted successfully.",
      };

      const content = gitBranchTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        operation: 'delete',
      });

      assertJsonField(content, 'operation', 'delete');
      assertJsonField(
        content,
        'message',
        "Branch 'old-branch' deleted successfully.",
      );
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitBranchTool.name).toBe('git_branch');
    });

    it('is marked as write operation', () => {
      expect(gitBranchTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitBranchTool.title).toBe('Git Branch');
      expect(gitBranchTool.description).toBeTruthy();
      expect(gitBranchTool.description.toLowerCase()).toContain('branch');
    });

    it('has valid schemas', () => {
      expect(gitBranchTool.inputSchema).toBeDefined();
      expect(gitBranchTool.outputSchema).toBeDefined();

      const inputShape = gitBranchTool.inputSchema.shape;
      expect(inputShape.operation).toBeDefined();
      expect(inputShape.name).toBeDefined();

      const outputShape = gitBranchTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.operation).toBeDefined();
    });
  });
});
