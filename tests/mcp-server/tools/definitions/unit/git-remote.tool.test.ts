/**
 * @fileoverview Unit tests for git-remote tool
 * @module tests/mcp-server/tools/definitions/unit/git-remote.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitRemoteTool } from '@/mcp-server/tools/definitions/git-remote.tool.js';
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
import type { GitRemoteResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_remote tool', () => {
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
      const result = gitRemoteTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('list');
        expect(result.data.push).toBe(false);
      }
    });

    it('accepts add mode with name and url', () => {
      const input = {
        path: '.',
        mode: 'add',
        name: 'upstream',
        url: 'https://github.com/upstream/repo.git',
      };
      const result = gitRemoteTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('add');
        expect(result.data.name).toBe('upstream');
        expect(result.data.url).toBe('https://github.com/upstream/repo.git');
      }
    });

    it('accepts remove mode', () => {
      const input = { path: '.', mode: 'remove', name: 'upstream' };
      const result = gitRemoteTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts rename mode with newName', () => {
      const input = {
        path: '.',
        mode: 'rename',
        name: 'origin',
        newName: 'upstream',
      };
      const result = gitRemoteTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newName).toBe('upstream');
      }
    });

    it('accepts get-url and set-url modes', () => {
      const getUrl = gitRemoteTool.inputSchema.safeParse({
        path: '.',
        mode: 'get-url',
        name: 'origin',
      });
      expect(getUrl.success).toBe(true);

      const setUrl = gitRemoteTool.inputSchema.safeParse({
        path: '.',
        mode: 'set-url',
        name: 'origin',
        url: 'https://github.com/new/repo.git',
      });
      expect(setUrl.success).toBe(true);
    });

    it('rejects invalid input types', () => {
      const input = { path: 123 };
      const result = gitRemoteTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic - List Mode', () => {
    it('lists remotes successfully', async () => {
      const mockRemoteResult: GitRemoteResult = {
        mode: 'list',
        remotes: [
          {
            name: 'origin',
            fetchUrl: 'https://github.com/test/repo.git',
            pushUrl: 'https://github.com/test/repo.git',
          },
        ],
      };

      mockProvider.remote.mockResolvedValue(mockRemoteResult);

      const parsedInput = gitRemoteTool.inputSchema.parse({
        path: '.',
        mode: 'list',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitRemoteTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.remote).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.remote.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('list');
      expect(result.remotes).toHaveLength(1);
      expect(result.remotes![0]!.name).toBe('origin');
    });
  });

  describe('Tool Logic - Add Mode', () => {
    it('adds remote successfully', async () => {
      const mockRemoteResult: GitRemoteResult = {
        mode: 'add',
        added: {
          name: 'upstream',
          url: 'https://github.com/upstream/repo.git',
        },
      };

      mockProvider.remote.mockResolvedValue(mockRemoteResult);

      const parsedInput = gitRemoteTool.inputSchema.parse({
        path: '.',
        mode: 'add',
        name: 'upstream',
        url: 'https://github.com/upstream/repo.git',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitRemoteTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('add');
      expect(result.added).toEqual({
        name: 'upstream',
        url: 'https://github.com/upstream/repo.git',
      });
    });
  });

  describe('Tool Logic - Remove Mode', () => {
    it('removes remote successfully', async () => {
      const mockRemoteResult: GitRemoteResult = {
        mode: 'remove',
        removed: 'upstream',
      };

      mockProvider.remote.mockResolvedValue(mockRemoteResult);

      const parsedInput = gitRemoteTool.inputSchema.parse({
        path: '.',
        mode: 'remove',
        name: 'upstream',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitRemoteTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('remove');
      expect(result.removed).toBe('upstream');
    });
  });

  describe('Tool Logic - Rename Mode', () => {
    it('renames remote successfully', async () => {
      const mockRemoteResult: GitRemoteResult = {
        mode: 'rename',
        renamed: { from: 'origin', to: 'upstream' },
      };

      mockProvider.remote.mockResolvedValue(mockRemoteResult);

      const parsedInput = gitRemoteTool.inputSchema.parse({
        path: '.',
        mode: 'rename',
        name: 'origin',
        newName: 'upstream',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitRemoteTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('rename');
      expect(result.renamed).toEqual({ from: 'origin', to: 'upstream' });
    });
  });

  describe('Tool Logic - Absolute Path', () => {
    it('uses absolute path when provided', async () => {
      const mockRemoteResult: GitRemoteResult = {
        mode: 'list',
        remotes: [],
      };

      mockProvider.remote.mockResolvedValue(mockRemoteResult);

      const parsedInput = gitRemoteTool.inputSchema.parse({
        path: '/absolute/repo/path',
        mode: 'list',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitRemoteTool.logic(parsedInput, appContext, sdkContext);

      const [_options, context] = mockProvider.remote.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
    });
  });

  describe('Response Formatter', () => {
    it('formats remote list correctly', () => {
      const result = {
        success: true,
        mode: 'list',
        remotes: [
          {
            name: 'origin',
            fetchUrl: 'https://github.com/test/repo.git',
            pushUrl: 'https://github.com/test/repo.git',
          },
        ],
      };

      const content = gitRemoteTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'list',
      });

      assertJsonField(content, 'mode', 'list');

      const parsed = parseJsonContent(content) as {
        remotes: Array<{ name: string; fetchUrl: string }>;
      };
      expect(parsed.remotes).toHaveLength(1);
      expect(parsed.remotes[0]!.name).toBe('origin');
      assertLlmFriendlyFormat(content);
    });

    it('formats add result correctly', () => {
      const result = {
        success: true,
        mode: 'add',
        added: {
          name: 'upstream',
          url: 'https://github.com/upstream/repo.git',
        },
      };

      const content = gitRemoteTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'add',
      });

      assertJsonField(content, 'added', {
        name: 'upstream',
        url: 'https://github.com/upstream/repo.git',
      });
    });

    it('formats remove result correctly', () => {
      const result = {
        success: true,
        mode: 'remove',
        removed: 'upstream',
      };

      const content = gitRemoteTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'remove',
      });

      assertJsonField(content, 'removed', 'upstream');
    });

    it('formats rename result correctly', () => {
      const result = {
        success: true,
        mode: 'rename',
        renamed: { from: 'origin', to: 'upstream' },
      };

      const content = gitRemoteTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        mode: 'rename',
      });

      assertJsonField(content, 'renamed', { from: 'origin', to: 'upstream' });
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitRemoteTool.name).toBe('git_remote');
    });

    it('is marked as write operation', () => {
      expect(gitRemoteTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitRemoteTool.title).toBe('Git Remote');
      expect(gitRemoteTool.description).toBeTruthy();
      expect(gitRemoteTool.description.toLowerCase()).toContain('remote');
    });

    it('has valid input and output schemas', () => {
      expect(gitRemoteTool.inputSchema).toBeDefined();
      expect(gitRemoteTool.outputSchema).toBeDefined();

      const inputShape = gitRemoteTool.inputSchema.shape;
      expect(inputShape.mode).toBeDefined();
      expect(inputShape.name).toBeDefined();
      expect(inputShape.url).toBeDefined();

      const outputShape = gitRemoteTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.mode).toBeDefined();
      expect(outputShape.remotes).toBeDefined();
    });
  });
});
