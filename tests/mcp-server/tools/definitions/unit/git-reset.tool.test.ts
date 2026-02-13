/**
 * @fileoverview Unit tests for git-reset tool
 * @module tests/mcp-server/tools/definitions/unit/git-reset.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitResetTool } from '@/mcp-server/tools/definitions/git-reset.tool.js';
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
import type { GitResetResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_reset tool', () => {
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
      const result = gitResetTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('mixed');
      }
    });

    it('accepts absolute path', () => {
      const input = { path: '/absolute/path/to/repo' };
      const result = gitResetTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts all valid mode values', () => {
      for (const mode of ['soft', 'mixed', 'hard', 'merge', 'keep'] as const) {
        const result = gitResetTool.inputSchema.safeParse({ path: '.', mode });
        expect(result.success).toBe(true);
      }
    });

    it('accepts target and paths options', () => {
      const input = { path: '.', target: 'HEAD~1', paths: ['file1.txt'] };
      const result = gitResetTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects invalid mode', () => {
      const result = gitResetTool.inputSchema.safeParse({
        path: '.',
        mode: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid input types', () => {
      const result = gitResetTool.inputSchema.safeParse({ path: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes reset operation successfully with session path', async () => {
      const mockResetResult: GitResetResult = {
        success: true,
        mode: 'mixed',
        commit: 'HEAD',
        filesReset: ['file1.txt'],
      };

      mockProvider.reset.mockResolvedValue(mockResetResult);

      const parsedInput = gitResetTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitResetTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.reset).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.reset.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        mode: 'mixed',
        target: 'HEAD',
        filesReset: ['file1.txt'],
      });
    });

    it('executes reset with absolute path', async () => {
      const mockResetResult: GitResetResult = {
        success: true,
        mode: 'hard',
        commit: 'abc123',
        filesReset: [],
      };

      mockProvider.reset.mockResolvedValue(mockResetResult);

      const parsedInput = gitResetTool.inputSchema.parse({
        path: '/absolute/repo/path',
        mode: 'hard',
        target: 'abc123',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitResetTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.reset).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.reset.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
      expect(result.mode).toBe('hard');
    });

    it('passes target and paths options to provider', async () => {
      const mockResetResult: GitResetResult = {
        success: true,
        mode: 'mixed',
        commit: 'HEAD~2',
        filesReset: ['src/index.ts'],
      };

      mockProvider.reset.mockResolvedValue(mockResetResult);

      const parsedInput = gitResetTool.inputSchema.parse({
        path: '.',
        target: 'HEAD~2',
        paths: ['src/index.ts'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitResetTool.logic(parsedInput, appContext, sdkContext);

      const [options] = mockProvider.reset.mock.calls[0]!;
      expect(options.commit).toBe('HEAD~2');
      expect(options.paths).toEqual(['src/index.ts']);
    });
  });

  describe('Response Formatter', () => {
    it('formats reset output correctly', () => {
      const result = {
        success: true,
        mode: 'mixed',
        target: 'HEAD',
        filesReset: ['file1.txt'],
      };

      const content = gitResetTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'mixed',
        target: 'HEAD',
      });

      assertJsonField(content, 'filesReset', ['file1.txt']);
      assertLlmFriendlyFormat(content);
    });

    it('formats reset with no affected files', () => {
      const result = {
        success: true,
        mode: 'soft',
        target: 'HEAD~1',
        filesReset: [],
      };

      const content = gitResetTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'soft',
        target: 'HEAD~1',
      });

      const parsed = parseJsonContent(content) as { filesReset: string[] };
      expect(parsed.filesReset).toHaveLength(0);
    });

    it('formats reset with multiple files', () => {
      const result = {
        success: true,
        mode: 'hard',
        target: 'abc123',
        filesReset: ['a.ts', 'b.ts', 'c.ts'],
      };

      const content = gitResetTool.responseFormatter!(result);

      const parsed = parseJsonContent(content) as { filesReset: string[] };
      expect(parsed.filesReset).toHaveLength(3);
      assertLlmFriendlyFormat(content);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitResetTool.name).toBe('git_reset');
    });

    it('is not marked as read-only', () => {
      expect(gitResetTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitResetTool.title).toBeTruthy();
      expect(gitResetTool.description).toBeTruthy();
      expect(gitResetTool.description.length).toBeGreaterThan(20);
    });

    it('has valid input and output schemas', () => {
      expect(gitResetTool.inputSchema).toBeDefined();
      expect(gitResetTool.outputSchema).toBeDefined();
    });
  });
});
