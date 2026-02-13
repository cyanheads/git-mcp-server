/**
 * @fileoverview Unit tests for git-init tool
 * @module tests/mcp-server/tools/definitions/unit/git-init.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitInitTool } from '@/mcp-server/tools/definitions/git-init.tool.js';
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
import type { GitInitResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_init tool', () => {
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
      const input = { path: '/test/new-repo' };
      const result = gitInitTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bare).toBe(false);
      }
    });

    it('accepts initialBranch option', () => {
      const input = { path: '/test/new-repo', initialBranch: 'develop' };
      const result = gitInitTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.initialBranch).toBe('develop');
      }
    });

    it('accepts bare flag', () => {
      const input = { path: '/test/new-repo', bare: true };
      const result = gitInitTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bare).toBe(true);
      }
    });

    it('rejects invalid input types', () => {
      const input = { path: 123 };
      const result = gitInitTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('initializes repository successfully with session path', async () => {
      const mockInitResult: GitInitResult = {
        success: true,
        path: '/test/repo',
        initialBranch: 'main',
        bare: false,
      };

      mockProvider.init.mockResolvedValue(mockInitResult);

      const parsedInput = gitInitTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitInitTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.init).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.init.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        path: '/test/repo',
        initialBranch: 'main',
        isBare: false,
      });
    });

    it('initializes repository with absolute path', async () => {
      const mockInitResult: GitInitResult = {
        success: true,
        path: '/absolute/new-repo',
        initialBranch: 'main',
        bare: false,
      };

      mockProvider.init.mockResolvedValue(mockInitResult);

      const parsedInput = gitInitTool.inputSchema.parse({
        path: '/absolute/new-repo',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitInitTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.init).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.init.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/new-repo');
      expect(result.path).toBe('/absolute/new-repo');
    });

    it('passes initialBranch to provider', async () => {
      const mockInitResult: GitInitResult = {
        success: true,
        path: '/test/repo',
        initialBranch: 'develop',
        bare: false,
      };

      mockProvider.init.mockResolvedValue(mockInitResult);

      const parsedInput = gitInitTool.inputSchema.parse({
        path: '.',
        initialBranch: 'develop',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitInitTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      const [initOptions] = mockProvider.init.mock.calls[0]!;
      expect(initOptions.initialBranch).toBe('develop');
      expect(result.initialBranch).toBe('develop');
    });

    it('passes bare flag to provider', async () => {
      const mockInitResult: GitInitResult = {
        success: true,
        path: '/test/repo',
        initialBranch: 'main',
        bare: true,
      };

      mockProvider.init.mockResolvedValue(mockInitResult);

      const parsedInput = gitInitTool.inputSchema.parse({
        path: '.',
        bare: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitInitTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      const [initOptions] = mockProvider.init.mock.calls[0]!;
      expect(initOptions.bare).toBe(true);
      expect(result.isBare).toBe(true);
    });
  });

  describe('Response Formatter', () => {
    it('formats init result correctly', () => {
      const result = {
        success: true,
        path: '/test/new-repo',
        initialBranch: 'main',
        isBare: false,
      };

      const content = gitInitTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        path: '/test/new-repo',
        initialBranch: 'main',
      });

      assertJsonField(content, 'path', '/test/new-repo');
      assertJsonField(content, 'initialBranch', 'main');
      assertLlmFriendlyFormat(content);
    });

    it('formats bare repository init', () => {
      const result = {
        success: true,
        path: '/test/bare-repo.git',
        initialBranch: 'main',
        isBare: true,
      };

      const content = gitInitTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        path: '/test/bare-repo.git',
      });

      const parsed = parseJsonContent(content) as { isBare?: boolean };
      // isBare may or may not be included based on verbosity
      if (parsed.isBare !== undefined) {
        expect(parsed.isBare).toBe(true);
      }
    });

    it('formats init with custom branch', () => {
      const result = {
        success: true,
        path: '/test/repo',
        initialBranch: 'develop',
        isBare: false,
      };

      const content = gitInitTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        initialBranch: 'develop',
      });

      assertJsonField(content, 'initialBranch', 'develop');
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitInitTool.name).toBe('git_init');
    });

    it('is marked as write operation', () => {
      expect(gitInitTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitInitTool.title).toBe('Git Init');
      expect(gitInitTool.description).toBeTruthy();
      expect(gitInitTool.description.toLowerCase()).toContain('init');
    });

    it('has valid input and output schemas', () => {
      expect(gitInitTool.inputSchema).toBeDefined();
      expect(gitInitTool.outputSchema).toBeDefined();

      const inputShape = gitInitTool.inputSchema.shape;
      expect(inputShape.path).toBeDefined();
      expect(inputShape.initialBranch).toBeDefined();
      expect(inputShape.bare).toBeDefined();

      const outputShape = gitInitTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.path).toBeDefined();
      expect(outputShape.initialBranch).toBeDefined();
      expect(outputShape.isBare).toBeDefined();
    });
  });
});
