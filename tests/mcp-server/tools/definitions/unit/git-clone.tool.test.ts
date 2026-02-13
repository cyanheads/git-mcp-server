/**
 * @fileoverview Unit tests for git-clone tool
 * @module tests/mcp-server/tools/definitions/unit/git-clone.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitCloneTool } from '@/mcp-server/tools/definitions/git-clone.tool.js';
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
  assertLlmFriendlyFormat,
} from '../helpers/index.js';
import type { GitCloneResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_clone tool', () => {
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
      const input = {
        url: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
      };
      const result = gitCloneTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bare).toBe(false);
        expect(result.data.mirror).toBe(false);
      }
    });

    it('accepts branch option', () => {
      const input = {
        url: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'develop',
      };
      const result = gitCloneTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.branch).toBe('develop');
      }
    });

    it('accepts depth option', () => {
      const input = {
        url: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        depth: 1,
      };
      const result = gitCloneTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.depth).toBe(1);
      }
    });

    it('accepts bare flag', () => {
      const input = {
        url: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        bare: true,
      };
      const result = gitCloneTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bare).toBe(true);
      }
    });

    it('accepts mirror flag', () => {
      const input = {
        url: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        mirror: true,
      };
      const result = gitCloneTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mirror).toBe(true);
      }
    });

    it('rejects invalid URL', () => {
      const input = { url: 'not-a-url', localPath: '/test/clone' };
      const result = gitCloneTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty localPath', () => {
      const input = {
        url: 'https://github.com/test/repo.git',
        localPath: '',
      };
      const result = gitCloneTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('clones repository successfully', async () => {
      const mockCloneResult: GitCloneResult = {
        success: true,
        remoteUrl: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'main',
      };

      mockProvider.clone.mockResolvedValue(mockCloneResult);

      const parsedInput = gitCloneTool.inputSchema.parse({
        url: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitCloneTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.clone).toHaveBeenCalledTimes(1);
      const [cloneOptions] = mockProvider.clone.mock.calls[0]!;
      expect(cloneOptions.remoteUrl).toBe('https://github.com/test/repo.git');
      expect(cloneOptions.localPath).toBe('/test/clone');

      expect(result).toMatchObject({
        success: true,
        remoteUrl: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'main',
      });
    });

    it('passes branch option to provider', async () => {
      const mockCloneResult: GitCloneResult = {
        success: true,
        remoteUrl: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'develop',
      };

      mockProvider.clone.mockResolvedValue(mockCloneResult);

      const parsedInput = gitCloneTool.inputSchema.parse({
        url: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'develop',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitCloneTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      const [cloneOptions] = mockProvider.clone.mock.calls[0]!;
      expect(cloneOptions.branch).toBe('develop');
      expect(result.branch).toBe('develop');
    });

    it('passes depth option to provider', async () => {
      const mockCloneResult: GitCloneResult = {
        success: true,
        remoteUrl: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'main',
      };

      mockProvider.clone.mockResolvedValue(mockCloneResult);

      const parsedInput = gitCloneTool.inputSchema.parse({
        url: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        depth: 1,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitCloneTool.logic(parsedInput, appContext, sdkContext);

      const [cloneOptions] = mockProvider.clone.mock.calls[0]!;
      expect(cloneOptions.depth).toBe(1);
    });

    it('passes bare and mirror flags to provider', async () => {
      const mockCloneResult: GitCloneResult = {
        success: true,
        remoteUrl: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'main',
      };

      mockProvider.clone.mockResolvedValue(mockCloneResult);

      const parsedInput = gitCloneTool.inputSchema.parse({
        url: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        bare: true,
        mirror: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitCloneTool.logic(parsedInput, appContext, sdkContext);

      const [cloneOptions] = mockProvider.clone.mock.calls[0]!;
      expect(cloneOptions.bare).toBe(true);
      expect(cloneOptions.mirror).toBe(true);
    });
  });

  describe('Response Formatter', () => {
    it('formats clone result correctly', () => {
      const result = {
        success: true,
        remoteUrl: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'main',
        commitHash: 'abc123',
      };

      const content = gitCloneTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        remoteUrl: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'main',
      });

      assertJsonField(content, 'remoteUrl', 'https://github.com/test/repo.git');
      assertJsonField(content, 'localPath', '/test/clone');
      assertJsonField(content, 'branch', 'main');
      assertLlmFriendlyFormat(content);
    });

    it('formats clone without commitHash', () => {
      const result = {
        success: true,
        remoteUrl: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'main',
      };

      const content = gitCloneTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        remoteUrl: 'https://github.com/test/repo.git',
      });

      const parsed = parseJsonContent(content) as {
        commitHash?: string;
      };
      // commitHash is optional, so may not be present
      expect(parsed).not.toHaveProperty('commitHash');
    });

    it('formats clone with specific branch', () => {
      const result = {
        success: true,
        remoteUrl: 'https://github.com/test/repo.git',
        localPath: '/test/clone',
        branch: 'feature-x',
      };

      const content = gitCloneTool.responseFormatter!(result);

      assertJsonField(content, 'branch', 'feature-x');
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitCloneTool.name).toBe('git_clone');
    });

    it('is marked as write operation', () => {
      expect(gitCloneTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitCloneTool.title).toBe('Git Clone');
      expect(gitCloneTool.description).toBeTruthy();
      expect(gitCloneTool.description.toLowerCase()).toContain('clone');
    });

    it('has valid input and output schemas', () => {
      expect(gitCloneTool.inputSchema).toBeDefined();
      expect(gitCloneTool.outputSchema).toBeDefined();

      const inputShape = gitCloneTool.inputSchema.shape;
      expect(inputShape.url).toBeDefined();
      expect(inputShape.localPath).toBeDefined();
      expect(inputShape.branch).toBeDefined();

      const outputShape = gitCloneTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.remoteUrl).toBeDefined();
      expect(outputShape.localPath).toBeDefined();
      expect(outputShape.branch).toBeDefined();
    });
  });
});
