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
  GitLogResult,
  GitRemoteResult,
  GitStatusResult,
  GitTagResult,
} from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const cleanStatus: GitStatusResult = {
  currentBranch: 'main',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  isClean: true,
  stagedChanges: {},
  unstagedChanges: {},
  untrackedFiles: [],
  conflictedFiles: [],
};

const remoteResult: GitRemoteResult = {
  mode: 'list',
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'https://github.com/test/repo.git',
      pushUrl: 'https://github.com/test/repo.git',
    },
  ],
};

const logResult: GitLogResult = {
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

const tagResult: GitTagResult = {
  mode: 'list',
  tags: [
    {
      name: 'v1.0.0',
      commit: 'abc123d',
      message: 'Initial release',
      annotationBody: 'First stable release.',
      tagger: 'Test User <test@example.com>',
      timestamp: 1704067200,
    },
  ],
};

function primeSnapshotMocks(
  mockProvider: ReturnType<typeof createMockGitProvider>,
) {
  mockProvider.status.mockResolvedValue(cleanStatus);
  mockProvider.log.mockResolvedValue(logResult);
  mockProvider.tag.mockResolvedValue(tagResult);
  mockProvider.remote.mockResolvedValue(remoteResult);
}

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
  });

  describe('Input Schema', () => {
    it('validates correct input with defaults', () => {
      const input = { path: '/test/repo' };
      const result = gitSetWorkingDirTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.validateGitRepo).toBe(true);
        expect(result.data.initializeIfNotPresent).toBe(false);
      }
    });

    it('accepts all options', () => {
      const input = {
        path: '/test/repo',
        validateGitRepo: false,
        initializeIfNotPresent: true,
      };
      const result = gitSetWorkingDirTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.validateGitRepo).toBe(false);
        expect(result.data.initializeIfNotPresent).toBe(true);
      }
    });

    it('rejects empty path', () => {
      const result = gitSetWorkingDirTool.inputSchema.safeParse({ path: '' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid path type', () => {
      const result = gitSetWorkingDirTool.inputSchema.safeParse({ path: 123 });
      expect(result.success).toBe(false);
    });

    it('rejects missing path', () => {
      const result = gitSetWorkingDirTool.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('sets working directory and returns snapshot by default', async () => {
      mockProvider.validateRepository.mockResolvedValue(undefined);
      primeSnapshotMocks(mockProvider);

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
      expect(result.repository).toBeDefined();
      expect(result.repository!.status.branch).toBe('main');
      expect(result.repository!.status.upstream).toBe('origin/main');
      expect(result.repository!.recentCommits).toHaveLength(1);
      expect(result.repository!.recentTags[0]!.name).toBe('v1.0.0');
      expect(result.repository!.recentTags[0]!.annotationSubject).toBe(
        'Initial release',
      );
      expect(result.repository!.recentTags[0]!.annotationBody).toBe(
        'First stable release.',
      );
      expect(result.repository!.remotes).toHaveLength(1);
      expect(result.enrichmentWarnings).toBeUndefined();
    });

    it('stores working directory in session storage', async () => {
      mockProvider.validateRepository.mockResolvedValue(undefined);
      primeSnapshotMocks(mockProvider);

      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/test/repo',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitSetWorkingDirTool.logic(parsedInput, appContext, sdkContext);

      const storedPath = await mockStorage.get<string>(
        'session:workingDir:test-tenant',
        appContext,
      );
      expect(storedPath).toBe('/test/repo');
    });

    it('skips validation when validateGitRepo is false', async () => {
      primeSnapshotMocks(mockProvider);

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
      primeSnapshotMocks(mockProvider);

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

    it('throws an actionable McpError when validation fails without init fallback', async () => {
      mockProvider.validateRepository.mockRejectedValue(
        new Error('Not a git repository'),
      );

      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/not/a/repo',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await expect(
        gitSetWorkingDirTool.logic(parsedInput, appContext, sdkContext),
      ).rejects.toThrow(/initializeIfNotPresent: true/);
    });

    it('collapses snapshot failures into a single warning when path is not a repo', async () => {
      const notARepo = new Error('fatal: not a git repository');
      mockProvider.status.mockRejectedValue(notARepo);
      mockProvider.log.mockRejectedValue(notARepo);
      mockProvider.tag.mockRejectedValue(notARepo);
      mockProvider.remote.mockRejectedValue(notARepo);

      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/not/a/repo',
        validateGitRepo: false,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitSetWorkingDirTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.repository).toBeUndefined();
      expect(result.enrichmentWarnings).toHaveLength(1);
      expect(result.enrichmentWarnings![0]).toMatch(/git repository/);
    });

    it('applies graceful tenantId default when missing', async () => {
      mockProvider.validateRepository.mockResolvedValue(undefined);
      primeSnapshotMocks(mockProvider);

      const parsedInput = gitSetWorkingDirTool.inputSchema.parse({
        path: '/test/repo',
      });
      const appContext = createTestContext();
      const sdkContext = createTestSdkContext();

      await gitSetWorkingDirTool.logic(parsedInput, appContext, sdkContext);

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
      };

      const content = gitSetWorkingDirTool.responseFormatter!(result);

      assertJsonContent(content, { success: true, path: '/test/repo' });
      assertJsonField(content, 'path', '/test/repo');
      assertJsonField(
        content,
        'message',
        'Working directory set to: /test/repo',
      );
      assertLlmFriendlyFormat(content);
    });

    it('formats result with repository snapshot', () => {
      const result = {
        success: true,
        path: '/test/repo',
        message: 'Working directory set to: /test/repo',
        repository: {
          status: {
            branch: 'main',
            isClean: true,
            staged: [],
            unstaged: [],
            untracked: [],
            conflicts: [],
            upstream: 'origin/main',
            ahead: 0,
            behind: 0,
          },
          recentCommits: [
            {
              hash: 'abc123d',
              author: 'Test User',
              date: '2024-01-01T00:00:00.000Z',
              subject: 'Initial commit',
            },
          ],
          recentTags: [
            {
              name: 'v1.0.0',
              date: '2024-01-01T00:00:00.000Z',
              tagger: 'Test User <test@example.com>',
              annotationSubject: 'Initial release',
              annotationBody: 'First stable release.',
            },
          ],
          remotes: [
            {
              name: 'origin',
              fetchUrl: 'https://github.com/test/repo.git',
              pushUrl: 'https://github.com/test/repo.git',
            },
          ],
        },
      };

      const content = gitSetWorkingDirTool.responseFormatter!(result);
      assertJsonContent(content, { success: true, path: '/test/repo' });

      const parsed = parseJsonContent(content) as {
        repository: {
          status: { branch: string; upstream: string };
          remotes: Array<{ name: string }>;
          recentTags: Array<{ annotationBody: string }>;
        };
      };

      expect(parsed.repository.status.branch).toBe('main');
      expect(parsed.repository.status.upstream).toBe('origin/main');
      expect(parsed.repository.remotes).toHaveLength(1);
      expect(parsed.repository.recentTags[0]!.annotationBody).toBe(
        'First stable release.',
      );
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
      expect(inputShape.initializeIfNotPresent).toBeDefined();

      const outputShape = gitSetWorkingDirTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.path).toBeDefined();
      expect(outputShape.message).toBeDefined();
      expect(outputShape.repository).toBeDefined();
    });
  });
});
