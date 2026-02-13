/**
 * @fileoverview Unit tests for git-blame tool
 * @module tests/mcp-server/tools/definitions/unit/git-blame.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitBlameTool } from '@/mcp-server/tools/definitions/git-blame.tool.js';
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
import type { GitBlameResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_blame tool', () => {
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
      const input = { path: '.', file: 'src/index.ts' };
      const result = gitBlameTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ignoreWhitespace).toBe(false);
      }
    });

    it('accepts line range parameters', () => {
      const input = {
        path: '.',
        file: 'src/index.ts',
        startLine: 10,
        endLine: 20,
      };
      const result = gitBlameTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startLine).toBe(10);
        expect(result.data.endLine).toBe(20);
      }
    });

    it('accepts ignoreWhitespace flag', () => {
      const input = {
        path: '.',
        file: 'src/index.ts',
        ignoreWhitespace: true,
      };
      const result = gitBlameTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ignoreWhitespace).toBe(true);
      }
    });

    it('rejects missing file parameter', () => {
      const input = { path: '.' };
      const result = gitBlameTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty file parameter', () => {
      const input = { path: '.', file: '' };
      const result = gitBlameTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid line numbers', () => {
      const input = { path: '.', file: 'src/index.ts', startLine: 0 };
      const result = gitBlameTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid path type', () => {
      const input = { path: 123, file: 'src/index.ts' };
      const result = gitBlameTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes blame operation successfully', async () => {
      const mockResult: GitBlameResult = {
        success: true,
        file: 'src/index.ts',
        lines: [
          {
            lineNumber: 1,
            commitHash: 'abc123def456',
            author: 'Test User',
            timestamp: 1704067200,
            content: 'const x = 1;',
          },
          {
            lineNumber: 2,
            commitHash: 'def456abc789',
            author: 'Another User',
            timestamp: 1704153600,
            content: 'const y = 2;',
          },
        ],
        totalLines: 2,
      };

      mockProvider.blame.mockResolvedValue(mockResult);

      const parsedInput = gitBlameTool.inputSchema.parse({
        path: '.',
        file: 'src/index.ts',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitBlameTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.blame).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.blame.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result.success).toBe(true);
      expect(result.file).toBe('src/index.ts');
      expect(result.lines).toHaveLength(2);
      expect(result.totalLines).toBe(2);
      expect(result.lines[0]!.author).toBe('Test User');
    });

    it('passes line range to provider', async () => {
      const mockResult: GitBlameResult = {
        success: true,
        file: 'src/index.ts',
        lines: [
          {
            lineNumber: 10,
            commitHash: 'abc123',
            author: 'Test User',
            timestamp: 1704067200,
            content: 'line 10 content',
          },
        ],
        totalLines: 1,
      };

      mockProvider.blame.mockResolvedValue(mockResult);

      const parsedInput = gitBlameTool.inputSchema.parse({
        path: '.',
        file: 'src/index.ts',
        startLine: 10,
        endLine: 20,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitBlameTool.logic(parsedInput, appContext, sdkContext);

      const [blameOptions] = mockProvider.blame.mock.calls[0]!;
      expect(blameOptions.file).toBe('src/index.ts');
      expect(blameOptions.startLine).toBe(10);
      expect(blameOptions.endLine).toBe(20);
    });

    it('passes ignoreWhitespace option to provider', async () => {
      const mockResult: GitBlameResult = {
        success: true,
        file: 'src/index.ts',
        lines: [],
        totalLines: 0,
      };

      mockProvider.blame.mockResolvedValue(mockResult);

      const parsedInput = gitBlameTool.inputSchema.parse({
        path: '.',
        file: 'src/index.ts',
        ignoreWhitespace: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitBlameTool.logic(parsedInput, appContext, sdkContext);

      const [blameOptions] = mockProvider.blame.mock.calls[0]!;
      expect(blameOptions.ignoreWhitespace).toBe(true);
    });

    it('uses absolute path when provided', async () => {
      const mockResult: GitBlameResult = {
        success: true,
        file: 'src/index.ts',
        lines: [],
        totalLines: 0,
      };

      mockProvider.blame.mockResolvedValue(mockResult);

      const parsedInput = gitBlameTool.inputSchema.parse({
        path: '/absolute/repo/path',
        file: 'src/index.ts',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitBlameTool.logic(parsedInput, appContext, sdkContext);

      const [_options, context] = mockProvider.blame.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
    });
  });

  describe('Response Formatter', () => {
    it('formats blame output correctly', () => {
      const result = {
        success: true,
        file: 'src/index.ts',
        lines: [
          {
            lineNumber: 1,
            commitHash: 'abc123def456',
            author: 'Test User',
            timestamp: 1704067200,
            content: 'const x = 1;',
          },
          {
            lineNumber: 2,
            commitHash: 'def456abc789',
            author: 'Another User',
            timestamp: 1704153600,
            content: 'const y = 2;',
          },
        ],
        totalLines: 2,
      };

      const content = gitBlameTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        file: 'src/index.ts',
        totalLines: 2,
      });

      assertJsonField(content, 'file', 'src/index.ts');
      assertJsonField(content, 'totalLines', 2);

      const parsed = parseJsonContent(content) as {
        lines: Array<{ author: string; lineNumber: number }>;
      };

      expect(parsed.lines).toHaveLength(2);
      expect(parsed.lines[0]!.author).toBe('Test User');
      expect(parsed.lines[1]!.lineNumber).toBe(2);

      assertLlmFriendlyFormat(content);
    });

    it('formats empty blame output', () => {
      const result = {
        success: true,
        file: 'empty.ts',
        lines: [],
        totalLines: 0,
      };

      const content = gitBlameTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        file: 'empty.ts',
        totalLines: 0,
      });

      assertJsonField(content, 'lines', []);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitBlameTool.name).toBe('git_blame');
    });

    it('has correct read-only annotation', () => {
      expect(gitBlameTool.annotations?.readOnlyHint).toBe(true);
    });

    it('has descriptive title and description', () => {
      expect(gitBlameTool.title).toBe('Git Blame');
      expect(gitBlameTool.description).toBeTruthy();
      expect(gitBlameTool.description.toLowerCase()).toContain('authorship');
    });

    it('has valid input and output schemas', () => {
      expect(gitBlameTool.inputSchema).toBeDefined();
      expect(gitBlameTool.outputSchema).toBeDefined();

      const inputShape = gitBlameTool.inputSchema.shape;
      expect(inputShape.file).toBeDefined();
      expect(inputShape.startLine).toBeDefined();

      const outputShape = gitBlameTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.lines).toBeDefined();
      expect(outputShape.totalLines).toBeDefined();
    });
  });
});
