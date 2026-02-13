/**
 * @fileoverview Unit tests for git-set-working-dir tool
 * @module tests/mcp-server/tools/definitions/unit/git-set-working-dir.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitSetWorkingDirTool } from '@/mcp-server/tools/definitions/git-set-working-dir.tool.js';
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
import type {
  GitStatusResult,
  GitBranchResult,
  GitRemoteResult,
  GitLogResult,
} from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_set_working_dir tool', () => {
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

    // Note: no session working dir set by default for this tool (skipPathResolution)
  });

  describe('Input Schema', () => {
    it('validates correct input with defaults', () => {
      const input = { path: '/test/repo' };
      const result = gitSetWorkingDirTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.validateGitRepo).toBe(true);
        expect(result.data.initializeIfNotPresent).toBe(false);
        expect(result.data.includeMetadata).toBe(false);
      }
    });

    it('accepts all options', () => {
      const input = {
        path: '/test/repo',
        validateGitRepo: false,
        initializeIfNotPresent: true,
        includeMetadata: true,
      };
      const result = gitSetWorkingDirTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.validateGitRepo).toBe(false);
        expect(result.data.initializeIfNotPresent).toBe(true);
        expect(result.data.includeMetadata).toBe(true);
      }
    });

    it('rejects empty path', () => {
      const input = { path: '' };
      const result = gitSetWorkingDirTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid path type', () => {
      const input = { path: 123 };
      const result = gitSetWorkingDirTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects missing path', () => {
      const input = {};
      const result = gitSetWorkingDirTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('sets working directory successfully', async () => {
      mockProvider.validateRepository.mockResolvedValue(undefined);

      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/test/repo',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitSetWorkingDirTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.validateRepository).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.path).toBe('/test/repo');
      expect(result.message).toContain('/test/repo');
    });

    it('stores working directory in session storage', async () => {
      mockProvider.validateRepository.mockResolvedValue(undefined);

      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/test/repo',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitSetWorkingDirTool.logic(parsedInput, appContext, sdkContext);

      // Verify the working directory was stored
      const storedPath = await mockStorage.get<string>(
        'session:workingDir:test-tenant',
        appContext,
      );
      expect(storedPath).toBe('/test/repo');
    });

    it('skips validation when validateGitRepo is false', async () => {
      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/test/repo',
        validateGitRepo: false,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitSetWorkingDirTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.validateRepository).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('initializes repo when validation fails and initializeIfNotPresent is true', async () => {
      mockProvider.validateRepository.mockRejectedValue(
        new Error('Not a git repository'),
      );
      mockProvider.init.mockResolvedValue({
        success: true,
        path: '/test/repo',
        bare: false,
        initialBranch: 'main',
      });

      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/test/repo',
        initializeIfNotPresent: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitSetWorkingDirTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.validateRepository).toHaveBeenCalledTimes(1);
      expect(mockProvider.init).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    it('includes repository metadata when includeMetadata is true', async () => {
      mockProvider.validateRepository.mockResolvedValue(undefined);

      const mockStatusResult: GitStatusResult = {
        currentBranch: 'main',
        isClean: true,
        stagedChanges: {},
        unstagedChanges: {},
        untrackedFiles: [],
        conflictedFiles: [],
      };

      const mockBranchResult: GitBranchResult = {
        mode: 'list',
        branches: [
          {
            name: 'main',
            current: true,
            commitHash: 'abc123',
            upstream: 'origin/main',
            ahead: 0,
            behind: 0,
          },
        ],
      };

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

      const mockLogResult: GitLogResult = {
        commits: [
          {
            hash: 'abc123def456',
            shortHash: 'abc123d',
            author: 'Test User',
            authorEmail: 'test@example.com',
            timestamp: 1704067200,
            subject: 'Initial commit',
            body: '',
            parents: [],
          },
        ],
        totalCount: 1,
      };

      mockProvider.status.mockResolvedValue(mockStatusResult);
      mockProvider.branch.mockResolvedValue(mockBranchResult);
      mockProvider.remote.mockResolvedValue(mockRemoteResult);
      mockProvider.log.mockResolvedValue(mockLogResult);

      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/test/repo',
        includeMetadata: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitSetWorkingDirTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.repositoryContext).toBeDefined();
      expect(result.repositoryContext!.status.branch).toBe('main');
      expect(result.repositoryContext!.status.isClean).toBe(true);
      expect(result.repositoryContext!.branches.current).toBe('main');
      expect(result.repositoryContext!.remotes).toHaveLength(1);
      expect(result.repositoryContext!.recentCommits).toHaveLength(1);
    });

    it('omits repository metadata when includeMetadata is false', async () => {
      mockProvider.validateRepository.mockResolvedValue(undefined);

      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/test/repo',
        includeMetadata: false,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitSetWorkingDirTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.repositoryContext).toBeUndefined();
      expect(mockProvider.status).not.toHaveBeenCalled();
    });

    it('applies graceful tenantId default when missing', async () => {
      mockProvider.validateRepository.mockResolvedValue(undefined);

      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/test/repo',
      });
      const appContext = createTestContext();
      const sdkContext = createTestSdkContext();

      await gitSetWorkingDirTool.logic(parsedInput, appContext, sdkContext);

      // Verify default tenant was used for storage
      const storedPath = await mockStorage.get<string>(
        'session:workingDir:default-tenant',
        appContext,
      );
      expect(storedPath).toBe('/test/repo');
    });
  });

  describe('Response Formatter', () => {
    it('formats basic result correctly', () => {
      const result = {
        success: true,
        path: '/test/repo',
        message: 'Working directory set to: /test/repo',
        repositoryContext: undefined,
      };

      const content = gitSetWorkingDirTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        path: '/test/repo',
      });

      assertJsonField(content, 'path', '/test/repo');
      assertJsonField(
        content,
        'message',
        'Working directory set to: /test/repo',
      );

      assertLlmFriendlyFormat(content);
    });

    it('formats result with repository context', () => {
      const result = {
        success: true,
        path: '/test/repo',
        message: 'Working directory set to: /test/repo',
        repositoryContext: {
          status: {
            branch: 'main',
            isClean: true,
            stagedCount: 0,
            unstagedCount: 0,
            untrackedCount: 0,
            conflictsCount: 0,
          },
          branches: {
            current: 'main',
            totalLocal: 1,
            totalRemote: 1,
          },
          remotes: [
            {
              name: 'origin',
              fetchUrl: 'https://github.com/test/repo.git',
              pushUrl: 'https://github.com/test/repo.git',
            },
          ],
          recentCommits: [
            {
              hash: 'abc123d',
              author: 'Test User',
              date: '2024-01-01T00:00:00.000Z',
              message: 'Initial commit',
            },
          ],
        },
      };

      const content = gitSetWorkingDirTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        path: '/test/repo',
      });

      const parsed = parseJsonContent(content) as {
        repositoryContext: {
          status: { branch: string };
          remotes: Array<{ name: string }>;
        };
      };

      expect(parsed.repositoryContext).toBeDefined();
      expect(parsed.repositoryContext.status.branch).toBe('main');
      expect(parsed.repositoryContext.remotes).toHaveLength(1);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitSetWorkingDirTool.name).toBe('git_set_working_dir');
    });

    it('is marked as write operation', () => {
      expect(gitSetWorkingDirTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitSetWorkingDirTool.title).toBe('Git Set Working Directory');
      expect(gitSetWorkingDirTool.description).toBeTruthy();
      expect(gitSetWorkingDirTool.description.toLowerCase()).toContain(
        'working directory',
      );
    });

    it('has valid input and output schemas', () => {
      expect(gitSetWorkingDirTool.inputSchema).toBeDefined();
      expect(gitSetWorkingDirTool.outputSchema).toBeDefined();

      const inputShape = gitSetWorkingDirTool.inputSchema.shape;
      expect(inputShape.path).toBeDefined();
      expect(inputShape.validateGitRepo).toBeDefined();
      expect(inputShape.includeMetadata).toBeDefined();

      const outputShape = gitSetWorkingDirTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.path).toBeDefined();
      expect(outputShape.message).toBeDefined();
    });
  });
});
