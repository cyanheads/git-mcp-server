/**
 * @fileoverview Unit tests for git-show tool
 * @module tests/mcp-server/tools/definitions/unit/git-show.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitShowTool } from '@/mcp-server/tools/definitions/git-show.tool.js';
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
import type { GitShowResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_show tool', () => {
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
      const input = { path: '.', object: 'HEAD' };
      const result = gitShowTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stat).toBe(false);
      }
    });

    it('accepts format option', () => {
      const input = { path: '.', object: 'abc123', format: 'json' };
      const result = gitShowTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe('json');
      }
    });

    it('accepts filePath option', () => {
      const input = { path: '.', object: 'HEAD', filePath: 'src/index.ts' };
      const result = gitShowTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filePath).toBe('src/index.ts');
      }
    });

    it('accepts stat flag', () => {
      const input = { path: '.', object: 'HEAD', stat: true };
      const result = gitShowTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stat).toBe(true);
      }
    });

    it('rejects invalid input types', () => {
      const input = { path: '.', object: 123 };
      const result = gitShowTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects missing object', () => {
      const input = { path: '.' };
      const result = gitShowTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes show operation successfully with session path', async () => {
      const mockShowResult: GitShowResult = {
        object: 'abc123',
        type: 'commit',
        content: 'commit content',
        metadata: {
          author: 'Test',
          date: '2025-01-01',
          message: 'test commit',
        },
      };

      mockProvider.show.mockResolvedValue(mockShowResult);

      const parsedInput = gitShowTool.inputSchema.parse({
        path: '.',
        object: 'abc123',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitShowTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.show).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.show.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        object: 'abc123',
        type: 'commit',
        content: 'commit content',
      });
    });

    it('executes show with absolute path', async () => {
      const mockShowResult: GitShowResult = {
        object: 'def456',
        type: 'blob',
        content: 'file content',
      };

      mockProvider.show.mockResolvedValue(mockShowResult);

      const parsedInput = gitShowTool.inputSchema.parse({
        path: '/absolute/repo/path',
        object: 'def456',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitShowTool.logic(parsedInput, appContext, sdkContext);

      expect(mockProvider.show).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.show.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
    });

    it('passes format option to provider', async () => {
      const mockShowResult: GitShowResult = {
        object: 'abc123',
        type: 'commit',
        content: '{}',
      };

      mockProvider.show.mockResolvedValue(mockShowResult);

      const parsedInput = gitShowTool.inputSchema.parse({
        path: '.',
        object: 'abc123',
        format: 'json',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitShowTool.logic(parsedInput, appContext, sdkContext);

      const [showOptions] = mockProvider.show.mock.calls[0]!;
      expect(showOptions.format).toBe('json');
    });

    it('passes filePath option to provider', async () => {
      const mockShowResult: GitShowResult = {
        object: 'HEAD:src/index.ts',
        type: 'blob',
        content: 'export default {};',
      };

      mockProvider.show.mockResolvedValue(mockShowResult);

      const parsedInput = gitShowTool.inputSchema.parse({
        path: '.',
        object: 'HEAD',
        filePath: 'src/index.ts',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitShowTool.logic(parsedInput, appContext, sdkContext);

      const [showOptions] = mockProvider.show.mock.calls[0]!;
      expect(showOptions.filePath).toBe('src/index.ts');
    });

    it('includes metadata in result when present', async () => {
      const mockShowResult: GitShowResult = {
        object: 'abc123',
        type: 'commit',
        content: 'commit content',
        metadata: { author: 'Test User', date: '2025-01-01', message: 'test' },
      };

      mockProvider.show.mockResolvedValue(mockShowResult);

      const parsedInput = gitShowTool.inputSchema.parse({
        path: '.',
        object: 'abc123',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitShowTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.metadata).toEqual({
        author: 'Test User',
        date: '2025-01-01',
        message: 'test',
      });
    });
  });

  describe('Response Formatter', () => {
    it('formats commit object correctly', () => {
      const result = {
        success: true,
        object: 'abc123',
        type: 'commit' as const,
        content: 'commit content with diff',
        metadata: {
          author: 'Test',
          date: '2025-01-01',
          message: 'test commit',
        },
      };

      const content = gitShowTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        object: 'abc123',
        type: 'commit',
      });

      assertJsonField(content, 'object', 'abc123');
      assertJsonField(content, 'type', 'commit');
      assertLlmFriendlyFormat(content);
    });

    it('formats blob object correctly', () => {
      const result = {
        success: true,
        object: 'def456',
        type: 'blob' as const,
        content: 'file content here',
      };

      const content = gitShowTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        object: 'def456',
        type: 'blob',
      });
    });

    it('includes metadata in formatted output', () => {
      const result = {
        success: true,
        object: 'abc123',
        type: 'commit' as const,
        content: 'content',
        metadata: { author: 'Test', date: '2025-01-01', message: 'msg' },
      };

      const content = gitShowTool.responseFormatter!(result);

      const parsed = parseJsonContent(content) as {
        metadata?: Record<string, unknown>;
      };
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata?.author).toBe('Test');
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitShowTool.name).toBe('git_show');
    });

    it('has correct read-only annotation', () => {
      expect(gitShowTool.annotations?.readOnlyHint).toBe(true);
    });

    it('has descriptive title and description', () => {
      expect(gitShowTool.title).toBe('Git Show');
      expect(gitShowTool.description).toBeTruthy();
      expect(gitShowTool.description.length).toBeGreaterThan(20);
    });

    it('has valid input and output schemas', () => {
      expect(gitShowTool.inputSchema).toBeDefined();
      expect(gitShowTool.outputSchema).toBeDefined();

      const inputShape = gitShowTool.inputSchema.shape;
      expect(inputShape.object).toBeDefined();
      expect(inputShape.format).toBeDefined();

      const outputShape = gitShowTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.object).toBeDefined();
      expect(outputShape.type).toBeDefined();
      expect(outputShape.content).toBeDefined();
    });
  });
});
