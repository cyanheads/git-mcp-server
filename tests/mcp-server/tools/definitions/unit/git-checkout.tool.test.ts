/**
 * @fileoverview Unit tests for git-checkout tool
 * @module tests/mcp-server/tools/definitions/unit/git-checkout.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitCheckoutTool } from '@/mcp-server/tools/definitions/git-checkout.tool.js';
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
import type { GitCheckoutResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_checkout tool', () => {
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
      const input = { path: '.', target: 'main' };
      const result = gitCheckoutTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createBranch).toBe(false);
        expect(result.data.force).toBe(false);
      }
    });

    it('accepts createBranch flag', () => {
      const input = { path: '.', target: 'feature-branch', createBranch: true };
      const result = gitCheckoutTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createBranch).toBe(true);
      }
    });

    it('accepts paths array', () => {
      const input = {
        path: '.',
        target: 'main',
        paths: ['file1.ts', 'file2.ts'],
      };
      const result = gitCheckoutTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.paths).toEqual(['file1.ts', 'file2.ts']);
      }
    });

    it('accepts track option', () => {
      const input = {
        path: '.',
        target: 'feature',
        createBranch: true,
        track: true,
      };
      const result = gitCheckoutTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.track).toBe(true);
      }
    });

    it('rejects invalid input types', () => {
      const input = { path: '.', target: 123 };
      const result = gitCheckoutTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes checkout operation successfully with session path', async () => {
      const mockCheckoutResult: GitCheckoutResult = {
        success: true,
        target: 'feature-branch',
        branchCreated: false,
        filesModified: ['file1.ts'],
      };

      mockProvider.checkout.mockResolvedValue(mockCheckoutResult);

      const parsedInput = gitCheckoutTool.inputSchema.parse({
        path: '.',
        target: 'feature-branch',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitCheckoutTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.checkout).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.checkout.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        target: 'feature-branch',
        branchCreated: false,
        filesModified: ['file1.ts'],
      });
    });

    it('executes checkout with absolute path', async () => {
      const mockCheckoutResult: GitCheckoutResult = {
        success: true,
        target: 'develop',
        branchCreated: false,
        filesModified: [],
      };

      mockProvider.checkout.mockResolvedValue(mockCheckoutResult);

      const parsedInput = gitCheckoutTool.inputSchema.parse({
        path: '/absolute/repo/path',
        target: 'develop',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitCheckoutTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.checkout).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.checkout.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
      expect(result.target).toBe('develop');
    });

    it('passes createBranch flag to provider', async () => {
      const mockCheckoutResult: GitCheckoutResult = {
        success: true,
        target: 'new-branch',
        branchCreated: true,
        filesModified: [],
      };

      mockProvider.checkout.mockResolvedValue(mockCheckoutResult);

      const parsedInput = gitCheckoutTool.inputSchema.parse({
        path: '.',
        target: 'new-branch',
        createBranch: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitCheckoutTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      const [checkoutOptions] = mockProvider.checkout.mock.calls[0]!;
      expect(checkoutOptions.createBranch).toBe(true);
      expect(result.branchCreated).toBe(true);
    });

    it('passes paths to provider', async () => {
      const mockCheckoutResult: GitCheckoutResult = {
        success: true,
        target: 'main',
        branchCreated: false,
        filesModified: ['src/index.ts'],
      };

      mockProvider.checkout.mockResolvedValue(mockCheckoutResult);

      const parsedInput = gitCheckoutTool.inputSchema.parse({
        path: '.',
        target: 'main',
        paths: ['src/index.ts'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitCheckoutTool.logic(parsedInput, appContext, sdkContext);

      const [checkoutOptions] = mockProvider.checkout.mock.calls[0]!;
      expect(checkoutOptions.paths).toEqual(['src/index.ts']);
    });
  });

  describe('Response Formatter', () => {
    it('formats checkout result correctly', () => {
      const result = {
        success: true,
        target: 'feature-branch',
        branchCreated: false,
        filesModified: ['file1.ts', 'file2.ts'],
      };

      const content = gitCheckoutTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        target: 'feature-branch',
        branchCreated: false,
      });

      assertJsonField(content, 'target', 'feature-branch');
      assertJsonField(content, 'branchCreated', false);
      assertJsonField(content, 'filesModified', ['file1.ts', 'file2.ts']);
      assertLlmFriendlyFormat(content);
    });

    it('formats checkout with new branch creation', () => {
      const result = {
        success: true,
        target: 'new-feature',
        branchCreated: true,
        filesModified: [],
      };

      const content = gitCheckoutTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        target: 'new-feature',
        branchCreated: true,
      });

      assertJsonField(content, 'branchCreated', true);
    });

    it('formats checkout with modified files', () => {
      const result = {
        success: true,
        target: 'main',
        branchCreated: false,
        filesModified: ['a.ts', 'b.ts', 'c.ts'],
      };

      const content = gitCheckoutTool.responseFormatter!(result);

      const parsed = parseJsonContent(content) as {
        filesModified: string[];
      };
      expect(parsed.filesModified).toHaveLength(3);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitCheckoutTool.name).toBe('git_checkout');
    });

    it('is marked as write operation', () => {
      expect(gitCheckoutTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitCheckoutTool.title).toBe('Git Checkout');
      expect(gitCheckoutTool.description).toBeTruthy();
      expect(gitCheckoutTool.description.length).toBeGreaterThan(20);
    });

    it('has valid input and output schemas', () => {
      expect(gitCheckoutTool.inputSchema).toBeDefined();
      expect(gitCheckoutTool.outputSchema).toBeDefined();

      const inputShape = gitCheckoutTool.inputSchema.shape;
      expect(inputShape.target).toBeDefined();
      expect(inputShape.createBranch).toBeDefined();

      const outputShape = gitCheckoutTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.target).toBeDefined();
      expect(outputShape.branchCreated).toBeDefined();
    });
  });
});
