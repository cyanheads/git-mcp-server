/**
 * @fileoverview Unit tests for git-merge tool
 * @module tests/mcp-server/tools/definitions/unit/git-merge.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitMergeTool } from '@/mcp-server/tools/definitions/git-merge.tool.js';
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
import type { GitMergeResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_merge tool', () => {
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
      const input = { path: '.', branch: 'feature' };
      const result = gitMergeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.noFastForward).toBe(false);
        expect(result.data.squash).toBe(false);
        expect(result.data.abort).toBe(false);
      }
    });

    it('accepts absolute path', () => {
      const input = { path: '/absolute/path/to/repo', branch: 'feature' };
      const result = gitMergeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts strategy option', () => {
      const input = { path: '.', branch: 'feature', strategy: 'ort' };
      const result = gitMergeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts all merge options', () => {
      const input = {
        path: '.',
        branch: 'feature',
        strategy: 'recursive' as const,
        noFastForward: true,
        squash: true,
        message: 'Custom merge message',
        abort: false,
      };
      const result = gitMergeTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects missing branch', () => {
      const result = gitMergeTool.inputSchema.safeParse({ path: '.' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid input types', () => {
      const result = gitMergeTool.inputSchema.safeParse({
        path: '.',
        branch: 123,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes merge operation successfully with session path', async () => {
      const mockMergeResult: GitMergeResult = {
        success: true,
        strategy: 'ort',
        fastForward: false,
        conflicts: false,
        conflictedFiles: [],
        mergedFiles: ['feature.ts'],
        message: 'Merge branch feature',
      };

      mockProvider.merge.mockResolvedValue(mockMergeResult);

      const parsedInput = gitMergeTool.inputSchema.parse({
        path: '.',
        branch: 'feature',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitMergeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.merge).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.merge.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        strategy: 'ort',
        fastForward: false,
        conflicts: false,
        conflictedFiles: [],
        mergedFiles: ['feature.ts'],
        message: 'Merge branch feature',
      });
    });

    it('executes merge with absolute path', async () => {
      const mockMergeResult: GitMergeResult = {
        success: true,
        strategy: 'ort',
        fastForward: true,
        conflicts: false,
        conflictedFiles: [],
        mergedFiles: [],
        message: 'Fast-forward',
      };

      mockProvider.merge.mockResolvedValue(mockMergeResult);

      const parsedInput = gitMergeTool.inputSchema.parse({
        path: '/absolute/repo/path',
        branch: 'develop',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitMergeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.merge).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.merge.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
      expect(result.fastForward).toBe(true);
    });

    it('passes noFastForward and squash options to provider', async () => {
      const mockMergeResult: GitMergeResult = {
        success: true,
        strategy: 'ort',
        fastForward: false,
        conflicts: false,
        conflictedFiles: [],
        mergedFiles: ['file.ts'],
        message: 'Squash merge',
      };

      mockProvider.merge.mockResolvedValue(mockMergeResult);

      const parsedInput = gitMergeTool.inputSchema.parse({
        path: '.',
        branch: 'feature',
        noFastForward: true,
        squash: true,
        message: 'Squash merge',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitMergeTool.logic(parsedInput, appContext, sdkContext);

      const [options] = mockProvider.merge.mock.calls[0]!;
      expect(options.noFastForward).toBe(true);
      expect(options.squash).toBe(true);
      expect(options.message).toBe('Squash merge');
    });
  });

  describe('Response Formatter', () => {
    it('formats successful merge output correctly', () => {
      const result = {
        success: true,
        strategy: 'ort',
        fastForward: false,
        conflicts: false,
        conflictedFiles: [],
        mergedFiles: ['feature.ts'],
        message: 'Merge branch feature',
      };

      const content = gitMergeTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        strategy: 'ort',
        conflicts: false,
      });

      assertJsonField(content, 'mergedFiles', ['feature.ts']);
      assertLlmFriendlyFormat(content);
    });

    it('formats merge with conflicts', () => {
      const result = {
        success: true,
        strategy: 'ort',
        fastForward: false,
        conflicts: true,
        conflictedFiles: ['src/index.ts', 'src/utils.ts'],
        mergedFiles: ['src/other.ts'],
        message: 'Merge branch feature (conflicts)',
      };

      const content = gitMergeTool.responseFormatter!(result);

      assertJsonField(content, 'conflicts', true);
      assertJsonField(content, 'conflictedFiles', [
        'src/index.ts',
        'src/utils.ts',
      ]);

      const parsed = parseJsonContent(content) as {
        conflictedFiles: string[];
      };
      expect(parsed.conflictedFiles).toHaveLength(2);
      assertLlmFriendlyFormat(content);
    });

    it('formats fast-forward merge', () => {
      const result = {
        success: true,
        strategy: 'ort',
        fastForward: true,
        conflicts: false,
        conflictedFiles: [],
        mergedFiles: [],
        message: 'Fast-forward',
      };

      const content = gitMergeTool.responseFormatter!(result);

      assertJsonField(content, 'fastForward', true);
      assertJsonField(content, 'conflicts', false);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitMergeTool.name).toBe('git_merge');
    });

    it('is not marked as read-only', () => {
      expect(gitMergeTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitMergeTool.title).toBeTruthy();
      expect(gitMergeTool.description).toBeTruthy();
      expect(gitMergeTool.description.length).toBeGreaterThan(20);
    });

    it('has valid input and output schemas', () => {
      expect(gitMergeTool.inputSchema).toBeDefined();
      expect(gitMergeTool.outputSchema).toBeDefined();
    });
  });
});
