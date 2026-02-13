/**
 * @fileoverview Unit tests for git-push tool
 * @module tests/mcp-server/tools/definitions/unit/git-push.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitPushTool } from '@/mcp-server/tools/definitions/git-push.tool.js';
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
import type { GitPushResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_push tool', () => {
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
    it('validates correct input with default values', () => {
      const input = { path: '.' };
      const result = gitPushTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.force).toBe(false);
        expect(result.data.forceWithLease).toBe(false);
        expect(result.data.setUpstream).toBe(false);
        expect(result.data.tags).toBe(false);
        expect(result.data.dryRun).toBe(false);
        expect(result.data.delete).toBe(false);
      }
    });

    it('accepts absolute path', () => {
      const input = { path: '/absolute/path/to/repo' };
      const result = gitPushTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts remote and branch options', () => {
      const input = { path: '.', remote: 'origin', branch: 'main' };
      const result = gitPushTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts all push options', () => {
      const input = {
        path: '.',
        remote: 'origin',
        branch: 'feature',
        force: true,
        forceWithLease: false,
        setUpstream: true,
        tags: true,
        dryRun: false,
        delete: false,
        remoteBranch: 'upstream-feature',
      };
      const result = gitPushTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects invalid remote name', () => {
      const result = gitPushTool.inputSchema.safeParse({
        path: '.',
        remote: 'invalid remote!',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid input types', () => {
      const result = gitPushTool.inputSchema.safeParse({ path: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes push operation successfully with session path', async () => {
      const mockPushResult: GitPushResult = {
        success: true,
        remote: 'origin',
        branch: 'main',
        upstreamSet: false,
        pushedRefs: ['refs/heads/main'],
        rejectedRefs: [],
      };

      mockProvider.push.mockResolvedValue(mockPushResult);

      const parsedInput = gitPushTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitPushTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.push).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.push.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        remote: 'origin',
        branch: 'main',
        upstreamSet: false,
        pushedRefs: ['refs/heads/main'],
        rejectedRefs: [],
      });
    });

    it('executes push with absolute path', async () => {
      const mockPushResult: GitPushResult = {
        success: true,
        remote: 'origin',
        branch: 'feature',
        upstreamSet: true,
        pushedRefs: ['refs/heads/feature'],
        rejectedRefs: [],
      };

      mockProvider.push.mockResolvedValue(mockPushResult);

      const parsedInput = gitPushTool.inputSchema.parse({
        path: '/absolute/repo/path',
        setUpstream: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitPushTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.push).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.push.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
      expect(result.upstreamSet).toBe(true);
    });

    it('passes force and tags options to provider', async () => {
      const mockPushResult: GitPushResult = {
        success: true,
        remote: 'origin',
        branch: 'main',
        upstreamSet: false,
        pushedRefs: ['refs/heads/main', 'refs/tags/v1.0.0'],
        rejectedRefs: [],
      };

      mockProvider.push.mockResolvedValue(mockPushResult);

      const parsedInput = gitPushTool.inputSchema.parse({
        path: '.',
        force: true,
        tags: true,
        remoteBranch: 'main',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitPushTool.logic(parsedInput, appContext, sdkContext);

      const [options] = mockProvider.push.mock.calls[0]!;
      expect(options.force).toBe(true);
      expect(options.tags).toBe(true);
      expect(options.remoteBranch).toBe('main');
    });
  });

  describe('Response Formatter', () => {
    it('formats successful push output correctly', () => {
      const result = {
        success: true,
        remote: 'origin',
        branch: 'main',
        upstreamSet: false,
        pushedRefs: ['refs/heads/main'],
        rejectedRefs: [],
      };

      const content = gitPushTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        remote: 'origin',
        branch: 'main',
      });

      assertJsonField(content, 'pushedRefs', ['refs/heads/main']);
      assertLlmFriendlyFormat(content);
    });

    it('formats push with rejected refs', () => {
      const result = {
        success: true,
        remote: 'origin',
        branch: 'main',
        upstreamSet: false,
        pushedRefs: [],
        rejectedRefs: ['refs/heads/main'],
      };

      const content = gitPushTool.responseFormatter!(result);

      assertJsonField(content, 'rejectedRefs', ['refs/heads/main']);

      const parsed = parseJsonContent(content) as {
        rejectedRefs: string[];
      };
      expect(parsed.rejectedRefs).toHaveLength(1);
      assertLlmFriendlyFormat(content);
    });

    it('formats push with upstream set', () => {
      const result = {
        success: true,
        remote: 'origin',
        branch: 'feature',
        upstreamSet: true,
        pushedRefs: ['refs/heads/feature'],
        rejectedRefs: [],
      };

      const content = gitPushTool.responseFormatter!(result);

      assertJsonField(content, 'upstreamSet', true);
      assertJsonField(content, 'branch', 'feature');
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitPushTool.name).toBe('git_push');
    });

    it('is not marked as read-only', () => {
      expect(gitPushTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitPushTool.title).toBeTruthy();
      expect(gitPushTool.description).toBeTruthy();
      expect(gitPushTool.description.length).toBeGreaterThan(20);
    });

    it('has valid input and output schemas', () => {
      expect(gitPushTool.inputSchema).toBeDefined();
      expect(gitPushTool.outputSchema).toBeDefined();
    });
  });
});
