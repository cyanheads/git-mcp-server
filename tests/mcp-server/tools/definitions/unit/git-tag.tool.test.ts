/**
 * @fileoverview Unit tests for git-tag tool
 * @module tests/mcp-server/tools/definitions/unit/git-tag.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitTagTool } from '@/mcp-server/tools/definitions/git-tag.tool.js';
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
import type { GitTagResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_tag tool', () => {
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
      const result = gitTagTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('list');
        expect(result.data.annotated).toBe(false);
        expect(result.data.force).toBe(false);
      }
    });

    it('accepts create mode with tag name', () => {
      const input = { path: '.', mode: 'create', tagName: 'v1.0.0' };
      const result = gitTagTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('create');
        expect(result.data.tagName).toBe('v1.0.0');
      }
    });

    it('accepts delete mode with tag name', () => {
      const input = { path: '.', mode: 'delete', tagName: 'v1.0.0' };
      const result = gitTagTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts annotated flag and message', () => {
      const input = {
        path: '.',
        mode: 'create',
        tagName: 'v2.0.0',
        annotated: true,
        message: 'Release v2.0.0',
      };
      const result = gitTagTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.annotated).toBe(true);
        expect(result.data.message).toBe('Release v2.0.0');
      }
    });

    it('accepts commit ref', () => {
      const input = {
        path: '.',
        mode: 'create',
        tagName: 'v1.0.0',
        commit: 'abc123',
      };
      const result = gitTagTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.commit).toBe('abc123');
      }
    });

    it('rejects invalid mode', () => {
      const input = { path: '.', mode: 'invalid' };
      const result = gitTagTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid path type', () => {
      const input = { path: 123 };
      const result = gitTagTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic - List Operation', () => {
    it('lists tags successfully', async () => {
      const mockResult: GitTagResult = {
        mode: 'list',
        tags: [
          { name: 'v1.0.0', commit: 'abc123' },
          { name: 'v2.0.0', commit: 'def456', message: 'Release v2.0.0' },
        ],
      };

      mockProvider.tag.mockResolvedValue(mockResult);

      const parsedInput = gitTagTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitTagTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.tag).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.tag.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('list');
      expect(result.tags).toHaveLength(2);
      expect(result.tags![0]!.name).toBe('v1.0.0');
    });
  });

  describe('Tool Logic - Create Operation', () => {
    it('creates tag successfully', async () => {
      const mockResult: GitTagResult = {
        mode: 'create',
        created: 'v1.0.0',
      };

      mockProvider.tag.mockResolvedValue(mockResult);

      const parsedInput = gitTagTool.inputSchema.parse({
        path: '.',
        mode: 'create',
        tagName: 'v1.0.0',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitTagTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.tag).toHaveBeenCalledTimes(1);
      const [tagOptions] = mockProvider.tag.mock.calls[0]!;
      expect(tagOptions.mode).toBe('create');
      expect(tagOptions.tagName).toBe('v1.0.0');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('create');
      expect(result.created).toBe('v1.0.0');
    });

    it('passes annotated and message options to provider', async () => {
      const mockResult: GitTagResult = {
        mode: 'create',
        created: 'v2.0.0',
      };

      mockProvider.tag.mockResolvedValue(mockResult);

      const parsedInput = gitTagTool.inputSchema.parse({
        path: '.',
        mode: 'create',
        tagName: 'v2.0.0',
        annotated: true,
        message: 'Release v2.0.0',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitTagTool.logic(parsedInput, appContext, sdkContext);

      const [tagOptions] = mockProvider.tag.mock.calls[0]!;
      expect(tagOptions.annotated).toBe(true);
      expect(tagOptions.message).toBe('Release v2.0.0');
    });
  });

  describe('Tool Logic - Delete Operation', () => {
    it('deletes tag successfully', async () => {
      const mockResult: GitTagResult = {
        mode: 'delete',
        deleted: 'v1.0.0',
      };

      mockProvider.tag.mockResolvedValue(mockResult);

      const parsedInput = gitTagTool.inputSchema.parse({
        path: '.',
        mode: 'delete',
        tagName: 'v1.0.0',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitTagTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.tag).toHaveBeenCalledTimes(1);
      const [tagOptions] = mockProvider.tag.mock.calls[0]!;
      expect(tagOptions.mode).toBe('delete');
      expect(tagOptions.tagName).toBe('v1.0.0');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('delete');
      expect(result.deleted).toBe('v1.0.0');
    });
  });

  describe('Response Formatter', () => {
    it('formats tag list correctly', () => {
      const result = {
        success: true,
        mode: 'list',
        tags: [
          { name: 'v1.0.0', commit: 'abc123' },
          {
            name: 'v2.0.0',
            commit: 'def456',
            message: 'Release v2.0.0',
            tagger: 'Test User <test@example.com>',
          },
        ],
        created: undefined,
        deleted: undefined,
      };

      const content = gitTagTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'list',
      });

      const parsed = parseJsonContent(content) as {
        tags: Array<{ name: string; commit: string }>;
      };

      expect(parsed.tags).toHaveLength(2);
      expect(parsed.tags[0]!.name).toBe('v1.0.0');
      expect(parsed.tags[1]!.name).toBe('v2.0.0');

      assertLlmFriendlyFormat(content);
    });

    it('formats create result correctly', () => {
      const result = {
        success: true,
        mode: 'create',
        tags: undefined,
        created: 'v1.0.0',
        deleted: undefined,
      };

      const content = gitTagTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'create',
      });

      assertJsonField(content, 'created', 'v1.0.0');
    });

    it('formats delete result correctly', () => {
      const result = {
        success: true,
        mode: 'delete',
        tags: undefined,
        created: undefined,
        deleted: 'v1.0.0',
      };

      const content = gitTagTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'delete',
      });

      assertJsonField(content, 'deleted', 'v1.0.0');
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitTagTool.name).toBe('git_tag');
    });

    it('is marked as write operation', () => {
      expect(gitTagTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitTagTool.title).toBe('Git Tag');
      expect(gitTagTool.description).toBeTruthy();
      expect(gitTagTool.description.toLowerCase()).toContain('tag');
    });

    it('has valid input and output schemas', () => {
      expect(gitTagTool.inputSchema).toBeDefined();
      expect(gitTagTool.outputSchema).toBeDefined();

      const inputShape = gitTagTool.inputSchema.shape;
      expect(inputShape.mode).toBeDefined();
      expect(inputShape.tagName).toBeDefined();

      const outputShape = gitTagTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.mode).toBeDefined();
    });
  });
});
