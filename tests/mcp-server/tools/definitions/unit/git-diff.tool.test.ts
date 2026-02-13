/**
 * @fileoverview Unit tests for git-diff tool
 * @module tests/mcp-server/tools/definitions/unit/git-diff.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitDiffTool } from '@/mcp-server/tools/definitions/git-diff.tool.js';
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
import type { GitDiffResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_diff tool', () => {
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
      const result = gitDiffTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staged).toBe(false);
        expect(result.data.includeUntracked).toBe(false);
        expect(result.data.nameOnly).toBe(false);
        expect(result.data.stat).toBe(false);
        expect(result.data.contextLines).toBe(3);
      }
    });

    it('accepts target and source refs', () => {
      const input = { path: '.', target: 'HEAD~1', source: 'main' };
      const result = gitDiffTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.target).toBe('HEAD~1');
        expect(result.data.source).toBe('main');
      }
    });

    it('accepts paths array', () => {
      const input = { path: '.', paths: ['src/index.ts', 'lib/utils.ts'] };
      const result = gitDiffTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.paths).toEqual(['src/index.ts', 'lib/utils.ts']);
      }
    });

    it('accepts staged flag', () => {
      const input = { path: '.', staged: true };
      const result = gitDiffTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staged).toBe(true);
      }
    });

    it('accepts custom contextLines', () => {
      const input = { path: '.', contextLines: 10 };
      const result = gitDiffTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contextLines).toBe(10);
      }
    });

    it('rejects invalid input types', () => {
      const input = { path: 123 };
      const result = gitDiffTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes diff operation successfully with session path', async () => {
      const mockDiffResult: GitDiffResult = {
        diff: 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts',
        filesChanged: 2,
        insertions: 10,
        deletions: 5,
        binary: false,
      };

      mockProvider.diff.mockResolvedValue(mockDiffResult);

      const parsedInput = gitDiffTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitDiffTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.diff).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.diff.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        diff: expect.stringContaining('diff --git'),
        filesChanged: 2,
        insertions: 10,
        deletions: 5,
      });
    });

    it('executes diff with absolute path', async () => {
      const mockDiffResult: GitDiffResult = {
        diff: '',
        filesChanged: 0,
      };

      mockProvider.diff.mockResolvedValue(mockDiffResult);

      const parsedInput = gitDiffTool.inputSchema.parse({
        path: '/absolute/repo/path',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitDiffTool.logic(parsedInput, appContext, sdkContext);

      expect(mockProvider.diff).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.diff.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
    });

    it('passes staged flag to provider', async () => {
      const mockDiffResult: GitDiffResult = {
        diff: 'staged diff',
        filesChanged: 1,
      };

      mockProvider.diff.mockResolvedValue(mockDiffResult);

      const parsedInput = gitDiffTool.inputSchema.parse({
        path: '.',
        staged: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitDiffTool.logic(parsedInput, appContext, sdkContext);

      const [diffOptions] = mockProvider.diff.mock.calls[0]!;
      expect(diffOptions.staged).toBe(true);
    });

    it('maps contextLines to unified option', async () => {
      const mockDiffResult: GitDiffResult = {
        diff: '',
        filesChanged: 0,
      };

      mockProvider.diff.mockResolvedValue(mockDiffResult);

      const parsedInput = gitDiffTool.inputSchema.parse({
        path: '.',
        contextLines: 10,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitDiffTool.logic(parsedInput, appContext, sdkContext);

      const [diffOptions] = mockProvider.diff.mock.calls[0]!;
      expect(diffOptions.unified).toBe(10);
    });

    it('handles empty diff', async () => {
      const mockDiffResult: GitDiffResult = {
        diff: '',
        filesChanged: 0,
      };

      mockProvider.diff.mockResolvedValue(mockDiffResult);

      const parsedInput = gitDiffTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitDiffTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.filesChanged).toBe(0);
      expect(result.diff).toBe('');
    });
  });

  describe('Response Formatter', () => {
    it('formats diff with changes correctly', () => {
      const result = {
        success: true,
        diff: 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,5 @@',
        filesChanged: 2,
        insertions: 10,
        deletions: 5,
      };

      const content = gitDiffTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        filesChanged: 2,
        insertions: 10,
        deletions: 5,
      });

      assertJsonField(content, 'filesChanged', 2);
      assertJsonField(content, 'insertions', 10);
      assertJsonField(content, 'deletions', 5);
      assertLlmFriendlyFormat(content);
    });

    it('formats empty diff', () => {
      const result = {
        success: true,
        diff: '',
        filesChanged: 0,
      };

      const content = gitDiffTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        filesChanged: 0,
      });

      assertJsonField(content, 'filesChanged', 0);
    });

    it('includes diff content in output', () => {
      const result = {
        success: true,
        diff: 'diff --git a/test.ts b/test.ts\n+added line',
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
      };

      const content = gitDiffTool.responseFormatter!(result);

      const parsed = parseJsonContent(content) as { diff: string };
      expect(parsed.diff).toContain('diff --git');
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitDiffTool.name).toBe('git_diff');
    });

    it('has correct read-only annotation', () => {
      expect(gitDiffTool.annotations?.readOnlyHint).toBe(true);
    });

    it('has descriptive title and description', () => {
      expect(gitDiffTool.title).toBe('Git Diff');
      expect(gitDiffTool.description).toBeTruthy();
      expect(gitDiffTool.description.toLowerCase()).toContain('diff');
    });

    it('has valid input and output schemas', () => {
      expect(gitDiffTool.inputSchema).toBeDefined();
      expect(gitDiffTool.outputSchema).toBeDefined();

      const inputShape = gitDiffTool.inputSchema.shape;
      expect(inputShape.staged).toBeDefined();
      expect(inputShape.contextLines).toBeDefined();

      const outputShape = gitDiffTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.diff).toBeDefined();
      expect(outputShape.filesChanged).toBeDefined();
    });
  });
});
