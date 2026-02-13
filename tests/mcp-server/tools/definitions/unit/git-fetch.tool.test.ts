/**
 * @fileoverview Unit tests for git-fetch tool
 * @module tests/mcp-server/tools/definitions/unit/git-fetch.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitFetchTool } from '@/mcp-server/tools/definitions/git-fetch.tool.js';
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
import type { GitFetchResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_fetch tool', () => {
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
      const result = gitFetchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prune).toBe(false);
        expect(result.data.tags).toBe(false);
      }
    });

    it('accepts remote name', () => {
      const input = { path: '.', remote: 'upstream' };
      const result = gitFetchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.remote).toBe('upstream');
      }
    });

    it('accepts prune flag', () => {
      const input = { path: '.', prune: true };
      const result = gitFetchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prune).toBe(true);
      }
    });

    it('accepts tags flag', () => {
      const input = { path: '.', tags: true };
      const result = gitFetchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toBe(true);
      }
    });

    it('accepts depth option', () => {
      const input = { path: '.', depth: 10 };
      const result = gitFetchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.depth).toBe(10);
      }
    });

    it('rejects invalid input types', () => {
      const input = { path: 123 };
      const result = gitFetchTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes fetch operation successfully with session path', async () => {
      const mockFetchResult: GitFetchResult = {
        success: true,
        remote: 'origin',
        fetchedRefs: ['refs/heads/main'],
        prunedRefs: [],
      };

      mockProvider.fetch.mockResolvedValue(mockFetchResult);

      const parsedInput = gitFetchTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitFetchTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.fetch).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.fetch.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        remote: 'origin',
        fetchedRefs: ['refs/heads/main'],
        prunedRefs: [],
      });
    });

    it('executes fetch with absolute path', async () => {
      const mockFetchResult: GitFetchResult = {
        success: true,
        remote: 'origin',
        fetchedRefs: [],
        prunedRefs: [],
      };

      mockProvider.fetch.mockResolvedValue(mockFetchResult);

      const parsedInput = gitFetchTool.inputSchema.parse({
        path: '/absolute/repo/path',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitFetchTool.logic(parsedInput, appContext, sdkContext);

      expect(mockProvider.fetch).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.fetch.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
    });

    it('passes remote name to provider', async () => {
      const mockFetchResult: GitFetchResult = {
        success: true,
        remote: 'upstream',
        fetchedRefs: ['refs/heads/develop'],
        prunedRefs: [],
      };

      mockProvider.fetch.mockResolvedValue(mockFetchResult);

      const parsedInput = gitFetchTool.inputSchema.parse({
        path: '.',
        remote: 'upstream',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitFetchTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      const [fetchOptions] = mockProvider.fetch.mock.calls[0]!;
      expect(fetchOptions.remote).toBe('upstream');
      expect(result.remote).toBe('upstream');
    });

    it('passes prune flag to provider', async () => {
      const mockFetchResult: GitFetchResult = {
        success: true,
        remote: 'origin',
        fetchedRefs: [],
        prunedRefs: ['refs/heads/stale-branch'],
      };

      mockProvider.fetch.mockResolvedValue(mockFetchResult);

      const parsedInput = gitFetchTool.inputSchema.parse({
        path: '.',
        prune: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitFetchTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      const [fetchOptions] = mockProvider.fetch.mock.calls[0]!;
      expect(fetchOptions.prune).toBe(true);
      expect(result.prunedRefs).toContain('refs/heads/stale-branch');
    });

    it('passes tags flag to provider', async () => {
      const mockFetchResult: GitFetchResult = {
        success: true,
        remote: 'origin',
        fetchedRefs: ['refs/tags/v1.0.0'],
        prunedRefs: [],
      };

      mockProvider.fetch.mockResolvedValue(mockFetchResult);

      const parsedInput = gitFetchTool.inputSchema.parse({
        path: '.',
        tags: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitFetchTool.logic(parsedInput, appContext, sdkContext);

      const [fetchOptions] = mockProvider.fetch.mock.calls[0]!;
      expect(fetchOptions.tags).toBe(true);
    });
  });

  describe('Response Formatter', () => {
    it('formats fetch result with fetched refs', () => {
      const result = {
        success: true,
        remote: 'origin',
        fetchedRefs: ['refs/heads/main', 'refs/heads/develop'],
        prunedRefs: [],
      };

      const content = gitFetchTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        remote: 'origin',
      });

      assertJsonField(content, 'remote', 'origin');
      assertJsonField(content, 'fetchedRefs', [
        'refs/heads/main',
        'refs/heads/develop',
      ]);
      assertJsonField(content, 'prunedRefs', []);
      assertLlmFriendlyFormat(content);
    });

    it('formats fetch result with pruned refs', () => {
      const result = {
        success: true,
        remote: 'origin',
        fetchedRefs: [],
        prunedRefs: ['refs/heads/old-branch'],
      };

      const content = gitFetchTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        remote: 'origin',
      });

      const parsed = parseJsonContent(content) as { prunedRefs: string[] };
      expect(parsed.prunedRefs).toHaveLength(1);
      expect(parsed.prunedRefs).toContain('refs/heads/old-branch');
    });

    it('formats empty fetch result', () => {
      const result = {
        success: true,
        remote: 'origin',
        fetchedRefs: [],
        prunedRefs: [],
      };

      const content = gitFetchTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        remote: 'origin',
        fetchedRefs: [],
        prunedRefs: [],
      });
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitFetchTool.name).toBe('git_fetch');
    });

    it('is marked as write operation', () => {
      expect(gitFetchTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitFetchTool.title).toBe('Git Fetch');
      expect(gitFetchTool.description).toBeTruthy();
      expect(gitFetchTool.description.toLowerCase()).toContain('fetch');
    });

    it('has valid input and output schemas', () => {
      expect(gitFetchTool.inputSchema).toBeDefined();
      expect(gitFetchTool.outputSchema).toBeDefined();

      const inputShape = gitFetchTool.inputSchema.shape;
      expect(inputShape.remote).toBeDefined();
      expect(inputShape.prune).toBeDefined();
      expect(inputShape.tags).toBeDefined();

      const outputShape = gitFetchTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.remote).toBeDefined();
      expect(outputShape.fetchedRefs).toBeDefined();
      expect(outputShape.prunedRefs).toBeDefined();
    });
  });
});
