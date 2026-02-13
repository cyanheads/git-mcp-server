/**
 * @fileoverview Unit tests for git-stash tool
 * @module tests/mcp-server/tools/definitions/unit/git-stash.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitStashTool } from '@/mcp-server/tools/definitions/git-stash.tool.js';
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
import type { GitStashResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_stash tool', () => {
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
      const result = gitStashTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('list');
        expect(result.data.includeUntracked).toBe(false);
        expect(result.data.keepIndex).toBe(false);
      }
    });

    it('accepts push mode with message', () => {
      const input = { path: '.', mode: 'push', message: 'WIP: feature work' };
      const result = gitStashTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('push');
        expect(result.data.message).toBe('WIP: feature work');
      }
    });

    it('accepts pop mode with stashRef', () => {
      const input = { path: '.', mode: 'pop', stashRef: 'stash@{0}' };
      const result = gitStashTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('pop');
        expect(result.data.stashRef).toBe('stash@{0}');
      }
    });

    it('accepts apply mode', () => {
      const input = { path: '.', mode: 'apply', stashRef: 'stash@{1}' };
      const result = gitStashTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts drop and clear modes', () => {
      const drop = gitStashTool.inputSchema.safeParse({
        path: '.',
        mode: 'drop',
        stashRef: 'stash@{0}',
      });
      expect(drop.success).toBe(true);

      const clear = gitStashTool.inputSchema.safeParse({
        path: '.',
        mode: 'clear',
      });
      expect(clear.success).toBe(true);
    });

    it('accepts includeUntracked and keepIndex flags', () => {
      const input = {
        path: '.',
        mode: 'push',
        includeUntracked: true,
        keepIndex: true,
      };
      const result = gitStashTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeUntracked).toBe(true);
        expect(result.data.keepIndex).toBe(true);
      }
    });

    it('rejects invalid input types', () => {
      const input = { path: 123 };
      const result = gitStashTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic - Push Mode', () => {
    it('pushes stash successfully', async () => {
      const mockStashResult: GitStashResult = {
        mode: 'push',
        created: 'stash@{0}',
      };

      mockProvider.stash.mockResolvedValue(mockStashResult);

      const parsedInput = gitStashTool.inputSchema.parse({
        path: '.',
        mode: 'push',
        message: 'WIP: feature',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitStashTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.stash).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.stash.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('push');
      expect(result.created).toBe('stash@{0}');
    });

    it('passes message to provider', async () => {
      const mockStashResult: GitStashResult = {
        mode: 'push',
        created: 'stash@{0}',
      };

      mockProvider.stash.mockResolvedValue(mockStashResult);

      const parsedInput = gitStashTool.inputSchema.parse({
        path: '.',
        mode: 'push',
        message: 'WIP: important changes',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitStashTool.logic(parsedInput, appContext, sdkContext);

      const [stashOptions] = mockProvider.stash.mock.calls[0]!;
      expect(stashOptions.message).toBe('WIP: important changes');
    });

    it('passes includeUntracked flag to provider', async () => {
      const mockStashResult: GitStashResult = {
        mode: 'push',
        created: 'stash@{0}',
      };

      mockProvider.stash.mockResolvedValue(mockStashResult);

      const parsedInput = gitStashTool.inputSchema.parse({
        path: '.',
        mode: 'push',
        includeUntracked: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitStashTool.logic(parsedInput, appContext, sdkContext);

      const [stashOptions] = mockProvider.stash.mock.calls[0]!;
      expect(stashOptions.includeUntracked).toBe(true);
    });

    it('passes keepIndex flag to provider', async () => {
      const mockStashResult: GitStashResult = {
        mode: 'push',
        created: 'stash@{0}',
      };

      mockProvider.stash.mockResolvedValue(mockStashResult);

      const parsedInput = gitStashTool.inputSchema.parse({
        path: '.',
        mode: 'push',
        keepIndex: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitStashTool.logic(parsedInput, appContext, sdkContext);

      const [stashOptions] = mockProvider.stash.mock.calls[0]!;
      expect(stashOptions.keepIndex).toBe(true);
    });
  });

  describe('Tool Logic - List Mode', () => {
    it('lists stashes successfully', async () => {
      const mockStashResult: GitStashResult = {
        mode: 'list',
        stashes: [
          {
            ref: 'stash@{0}',
            index: 0,
            branch: 'main',
            description: 'WIP: feature',
            timestamp: 1609459200,
          },
          {
            ref: 'stash@{1}',
            index: 1,
            branch: 'develop',
            description: 'WIP: bugfix',
            timestamp: 1609372800,
          },
        ],
      };

      mockProvider.stash.mockResolvedValue(mockStashResult);

      const parsedInput = gitStashTool.inputSchema.parse({
        path: '.',
        mode: 'list',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitStashTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('list');
      expect(result.stashes).toHaveLength(2);
      expect(result.stashes![0]!.ref).toBe('stash@{0}');
    });
  });

  describe('Tool Logic - Pop/Apply Mode', () => {
    it('pops stash successfully', async () => {
      const mockStashResult: GitStashResult = {
        mode: 'pop',
        applied: 'stash@{0}',
        conflicts: false,
      };

      mockProvider.stash.mockResolvedValue(mockStashResult);

      const parsedInput = gitStashTool.inputSchema.parse({
        path: '.',
        mode: 'pop',
        stashRef: 'stash@{0}',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitStashTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('pop');
      expect(result.applied).toBe('stash@{0}');
      expect(result.conflicts).toBe(false);
    });

    it('applies stash with conflicts', async () => {
      const mockStashResult: GitStashResult = {
        mode: 'apply',
        applied: 'stash@{0}',
        conflicts: true,
      };

      mockProvider.stash.mockResolvedValue(mockStashResult);

      const parsedInput = gitStashTool.inputSchema.parse({
        path: '.',
        mode: 'apply',
        stashRef: 'stash@{0}',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitStashTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.conflicts).toBe(true);
    });
  });

  describe('Tool Logic - Absolute Path', () => {
    it('uses absolute path when provided', async () => {
      const mockStashResult: GitStashResult = {
        mode: 'list',
        stashes: [],
      };

      mockProvider.stash.mockResolvedValue(mockStashResult);

      const parsedInput = gitStashTool.inputSchema.parse({
        path: '/absolute/repo/path',
        mode: 'list',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitStashTool.logic(parsedInput, appContext, sdkContext);

      const [_options, context] = mockProvider.stash.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
    });
  });

  describe('Response Formatter', () => {
    it('formats push result correctly', () => {
      const result = {
        success: true,
        mode: 'push',
        created: 'stash@{0}',
      };

      const content = gitStashTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'push',
      });

      assertJsonField(content, 'mode', 'push');
      assertJsonField(content, 'created', 'stash@{0}');
      assertLlmFriendlyFormat(content);
    });

    it('formats list result with stashes', () => {
      const result = {
        success: true,
        mode: 'list',
        stashes: [
          {
            ref: 'stash@{0}',
            index: 0,
            branch: 'main',
            description: 'WIP',
            timestamp: 1609459200,
          },
        ],
      };

      const content = gitStashTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'list',
      });

      const parsed = parseJsonContent(content) as {
        stashes: Array<{ ref: string }>;
      };
      expect(parsed.stashes).toHaveLength(1);
      expect(parsed.stashes[0]!.ref).toBe('stash@{0}');
    });

    it('formats pop result correctly', () => {
      const result = {
        success: true,
        mode: 'pop',
        applied: 'stash@{0}',
        conflicts: false,
      };

      const content = gitStashTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'pop',
      });

      assertJsonField(content, 'applied', 'stash@{0}');
      assertJsonField(content, 'conflicts', false);
    });

    it('formats drop result correctly', () => {
      const result = {
        success: true,
        mode: 'drop',
        dropped: 'stash@{0}',
      };

      const content = gitStashTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'drop',
      });

      assertJsonField(content, 'dropped', 'stash@{0}');
    });

    it('formats clear result correctly', () => {
      const result = {
        success: true,
        mode: 'clear',
      };

      const content = gitStashTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'clear',
      });
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitStashTool.name).toBe('git_stash');
    });

    it('is marked as write operation', () => {
      expect(gitStashTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitStashTool.title).toBe('Git Stash');
      expect(gitStashTool.description).toBeTruthy();
      expect(gitStashTool.description.toLowerCase()).toContain('stash');
    });

    it('has valid input and output schemas', () => {
      expect(gitStashTool.inputSchema).toBeDefined();
      expect(gitStashTool.outputSchema).toBeDefined();

      const inputShape = gitStashTool.inputSchema.shape;
      expect(inputShape.mode).toBeDefined();
      expect(inputShape.message).toBeDefined();
      expect(inputShape.stashRef).toBeDefined();

      const outputShape = gitStashTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.mode).toBeDefined();
      expect(outputShape.stashes).toBeDefined();
      expect(outputShape.created).toBeDefined();
    });
  });
});
