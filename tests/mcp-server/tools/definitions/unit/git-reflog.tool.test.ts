/**
 * @fileoverview Unit tests for git-reflog tool
 * @module tests/mcp-server/tools/definitions/unit/git-reflog.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitReflogTool } from '@/mcp-server/tools/definitions/git-reflog.tool.js';
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
import type { GitReflogResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_reflog tool', () => {
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
      const result = gitReflogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ref).toBeUndefined();
        expect(result.data.maxCount).toBeUndefined();
      }
    });

    it('accepts ref parameter', () => {
      const input = { path: '.', ref: 'main' };
      const result = gitReflogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ref).toBe('main');
      }
    });

    it('accepts maxCount parameter', () => {
      const input = { path: '.', maxCount: 50 };
      const result = gitReflogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxCount).toBe(50);
      }
    });

    it('rejects maxCount below 1', () => {
      const input = { path: '.', maxCount: 0 };
      const result = gitReflogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid path type', () => {
      const input = { path: 123 };
      const result = gitReflogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes reflog operation successfully', async () => {
      const mockResult: GitReflogResult = {
        success: true,
        ref: 'HEAD',
        entries: [
          {
            hash: 'abc123',
            refName: 'HEAD@{0}',
            action: 'commit',
            message: 'feat: add new feature',
            timestamp: 1704067200,
          },
          {
            hash: 'def456',
            refName: 'HEAD@{1}',
            action: 'checkout',
            message: 'moving from main to feature',
            timestamp: 1704060000,
          },
        ],
        totalEntries: 2,
      };

      mockProvider.reflog.mockResolvedValue(mockResult);

      const parsedInput = gitReflogTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitReflogTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.reflog).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.reflog.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result.success).toBe(true);
      expect(result.ref).toBe('HEAD');
      expect(result.entries).toHaveLength(2);
      expect(result.totalEntries).toBe(2);
      expect(result.entries[0]!.action).toBe('commit');
    });

    it('passes ref option to provider', async () => {
      const mockResult: GitReflogResult = {
        success: true,
        ref: 'main',
        entries: [],
        totalEntries: 0,
      };

      mockProvider.reflog.mockResolvedValue(mockResult);

      const parsedInput = gitReflogTool.inputSchema.parse({
        path: '.',
        ref: 'main',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitReflogTool.logic(parsedInput, appContext, sdkContext);

      const [reflogOptions] = mockProvider.reflog.mock.calls[0]!;
      expect(reflogOptions.ref).toBe('main');
    });

    it('passes maxCount option to provider', async () => {
      const mockResult: GitReflogResult = {
        success: true,
        ref: 'HEAD',
        entries: [],
        totalEntries: 0,
      };

      mockProvider.reflog.mockResolvedValue(mockResult);

      const parsedInput = gitReflogTool.inputSchema.parse({
        path: '.',
        maxCount: 10,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitReflogTool.logic(parsedInput, appContext, sdkContext);

      const [reflogOptions] = mockProvider.reflog.mock.calls[0]!;
      expect(reflogOptions.maxCount).toBe(10);
    });

    it('uses absolute path when provided', async () => {
      const mockResult: GitReflogResult = {
        success: true,
        ref: 'HEAD',
        entries: [],
        totalEntries: 0,
      };

      mockProvider.reflog.mockResolvedValue(mockResult);

      const parsedInput = gitReflogTool.inputSchema.parse({
        path: '/absolute/repo/path',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitReflogTool.logic(parsedInput, appContext, sdkContext);

      const [_options, context] = mockProvider.reflog.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
    });
  });

  describe('Response Formatter', () => {
    it('formats reflog output correctly', () => {
      const result = {
        success: true,
        ref: 'HEAD',
        entries: [
          {
            hash: 'abc123',
            refName: 'HEAD@{0}',
            action: 'commit',
            message: 'feat: add new feature',
            timestamp: 1704067200,
          },
          {
            hash: 'def456',
            refName: 'HEAD@{1}',
            action: 'checkout',
            message: 'moving from main to feature',
            timestamp: 1704060000,
          },
        ],
        totalEntries: 2,
      };

      const content = gitReflogTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        ref: 'HEAD',
        totalEntries: 2,
      });

      assertJsonField(content, 'ref', 'HEAD');
      assertJsonField(content, 'totalEntries', 2);

      const parsed = parseJsonContent(content) as {
        entries: Array<{ hash: string; action: string }>;
      };

      expect(parsed.entries).toHaveLength(2);
      expect(parsed.entries[0]!.hash).toBe('abc123');
      expect(parsed.entries[0]!.action).toBe('commit');

      assertLlmFriendlyFormat(content);
    });

    it('formats empty reflog output', () => {
      const result = {
        success: true,
        ref: 'HEAD',
        entries: [],
        totalEntries: 0,
      };

      const content = gitReflogTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        ref: 'HEAD',
        totalEntries: 0,
      });

      assertJsonField(content, 'entries', []);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitReflogTool.name).toBe('git_reflog');
    });

    it('has correct read-only annotation', () => {
      expect(gitReflogTool.annotations?.readOnlyHint).toBe(true);
    });

    it('has descriptive title and description', () => {
      expect(gitReflogTool.title).toBe('Git Reflog');
      expect(gitReflogTool.description).toBeTruthy();
      expect(gitReflogTool.description.toLowerCase()).toContain('reflog');
    });

    it('has valid input and output schemas', () => {
      expect(gitReflogTool.inputSchema).toBeDefined();
      expect(gitReflogTool.outputSchema).toBeDefined();

      const inputShape = gitReflogTool.inputSchema.shape;
      expect(inputShape.ref).toBeDefined();
      expect(inputShape.maxCount).toBeDefined();

      const outputShape = gitReflogTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.entries).toBeDefined();
      expect(outputShape.totalEntries).toBeDefined();
    });
  });
});
