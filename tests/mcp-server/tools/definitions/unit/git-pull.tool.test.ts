/**
 * @fileoverview Unit tests for git-pull tool
 * @module tests/mcp-server/tools/definitions/unit/git-pull.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitPullTool } from '@/mcp-server/tools/definitions/git-pull.tool.js';
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
import type { GitPullResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_pull tool', () => {
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
    it('validates correct input with default values', () => {
      const input = { path: '.' };
      const result = gitPullTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rebase).toBe(false);
        expect(result.data.fastForwardOnly).toBe(false);
      }
    });

    it('accepts absolute path', () => {
      const input = { path: '/absolute/path/to/repo' };
      const result = gitPullTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts remote and branch options', () => {
      const input = { path: '.', remote: 'origin', branch: 'main' };
      const result = gitPullTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts all pull options', () => {
      const input = {
        path: '.',
        remote: 'upstream',
        branch: 'develop',
        rebase: true,
        fastForwardOnly: false,
      };
      const result = gitPullTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects invalid remote name', () => {
      const result = gitPullTool.inputSchema.safeParse({
        path: '.',
        remote: 'invalid remote!',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid input types', () => {
      const result = gitPullTool.inputSchema.safeParse({ path: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes pull operation successfully with session path', async () => {
      const mockPullResult: GitPullResult = {
        success: true,
        remote: 'origin',
        branch: 'main',
        strategy: 'merge',
        conflicts: false,
        filesChanged: ['file1.ts'],
      };

      mockProvider.pull.mockResolvedValue(mockPullResult);

      const parsedInput = gitPullTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitPullTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.pull).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.pull.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        remote: 'origin',
        branch: 'main',
        strategy: 'merge',
        conflicts: false,
        filesChanged: ['file1.ts'],
      });
    });

    it('executes pull with absolute path', async () => {
      const mockPullResult: GitPullResult = {
        success: true,
        remote: 'origin',
        branch: 'develop',
        strategy: 'fast-forward',
        conflicts: false,
        filesChanged: [],
      };

      mockProvider.pull.mockResolvedValue(mockPullResult);

      const parsedInput = gitPullTool.inputSchema.parse({
        path: '/absolute/repo/path',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitPullTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.pull).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.pull.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
      expect(result.strategy).toBe('fast-forward');
    });

    it('passes rebase and fastForwardOnly options to provider', async () => {
      const mockPullResult: GitPullResult = {
        success: true,
        remote: 'upstream',
        branch: 'main',
        strategy: 'rebase',
        conflicts: false,
        filesChanged: ['src/index.ts'],
      };

      mockProvider.pull.mockResolvedValue(mockPullResult);

      const parsedInput = gitPullTool.inputSchema.parse({
        path: '.',
        remote: 'upstream',
        branch: 'main',
        rebase: true,
        fastForwardOnly: false,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitPullTool.logic(parsedInput, appContext, sdkContext);

      const [options] = mockProvider.pull.mock.calls[0]!;
      expect(options.remote).toBe('upstream');
      expect(options.branch).toBe('main');
      expect(options.rebase).toBe(true);
      expect(options.fastForwardOnly).toBe(false);
    });
  });

  describe('Response Formatter', () => {
    it('formats successful pull output correctly', () => {
      const result = {
        success: true,
        remote: 'origin',
        branch: 'main',
        strategy: 'merge' as const,
        conflicts: false,
        filesChanged: ['file1.ts'],
      };

      const content = gitPullTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        remote: 'origin',
        branch: 'main',
        conflicts: false,
      });

      assertJsonField(content, 'strategy', 'merge');
      assertJsonField(content, 'filesChanged', ['file1.ts']);
      assertLlmFriendlyFormat(content);
    });

    it('formats pull with conflicts', () => {
      const result = {
        success: true,
        remote: 'origin',
        branch: 'main',
        strategy: 'merge' as const,
        conflicts: true,
        filesChanged: ['src/index.ts', 'src/utils.ts'],
      };

      const content = gitPullTool.responseFormatter!(result);

      assertJsonField(content, 'conflicts', true);

      const parsed = parseJsonContent(content) as {
        filesChanged: string[];
      };
      expect(parsed.filesChanged).toHaveLength(2);
      assertLlmFriendlyFormat(content);
    });

    it('formats pull with rebase strategy', () => {
      const result = {
        success: true,
        remote: 'origin',
        branch: 'main',
        strategy: 'rebase' as const,
        conflicts: false,
        filesChanged: [],
      };

      const content = gitPullTool.responseFormatter!(result);

      assertJsonField(content, 'strategy', 'rebase');
      assertJsonField(content, 'conflicts', false);
    });

    it('formats pull with no changed files', () => {
      const result = {
        success: true,
        remote: 'origin',
        branch: 'main',
        strategy: 'fast-forward' as const,
        conflicts: false,
        filesChanged: [],
      };

      const content = gitPullTool.responseFormatter!(result);

      const parsed = parseJsonContent(content) as {
        filesChanged: string[];
      };
      expect(parsed.filesChanged).toHaveLength(0);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitPullTool.name).toBe('git_pull');
    });

    it('is not marked as read-only', () => {
      expect(gitPullTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitPullTool.title).toBeTruthy();
      expect(gitPullTool.description).toBeTruthy();
      expect(gitPullTool.description.length).toBeGreaterThan(20);
    });

    it('has valid input and output schemas', () => {
      expect(gitPullTool.inputSchema).toBeDefined();
      expect(gitPullTool.outputSchema).toBeDefined();
    });
  });
});
