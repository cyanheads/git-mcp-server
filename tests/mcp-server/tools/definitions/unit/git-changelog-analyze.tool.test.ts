/**
 * @fileoverview Unit tests for git-changelog-analyze tool
 * @module tests/mcp-server/tools/definitions/unit/git-changelog-analyze.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitChangelogAnalyzeTool } from '@/mcp-server/tools/definitions/git-changelog-analyze.tool.js';
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
import type { GitLogResult, GitTagResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_changelog_analyze tool', () => {
  const mockProvider = createMockGitProvider();
  const mockStorage = createMockStorageService();
  const mockFactory = {
    getProvider: vi.fn(async () => mockProvider),
  } as unknown as GitProviderFactory;

  const mockLogResult: GitLogResult = {
    commits: [
      {
        hash: 'abc123def456',
        shortHash: 'abc123d',
        author: 'Casey',
        authorEmail: 'casey@example.com',
        timestamp: 1700000000,
        subject: 'feat: add authentication module',
        body: '',
        parents: ['parent1'],
        refs: ['HEAD', 'main'],
      },
      {
        hash: 'def456ghi789',
        shortHash: 'def456g',
        author: 'Casey',
        authorEmail: 'casey@example.com',
        timestamp: 1699900000,
        subject: 'fix: patch XSS vulnerability in input handler',
        body: '',
        parents: ['parent2'],
        refs: [],
      },
      {
        hash: 'ghi789jkl012',
        shortHash: 'ghi789j',
        author: 'Dev',
        authorEmail: 'dev@example.com',
        timestamp: 1699800000,
        subject: 'chore: update dependencies',
        body: '',
        parents: ['parent3'],
        refs: ['v1.2.0'],
      },
    ],
    totalCount: 3,
  };

  const mockTagResult: GitTagResult = {
    mode: 'list',
    tags: [
      { name: 'v1.2.0', commit: 'ghi789jkl012', timestamp: 1699800000 },
      {
        name: 'v1.1.0',
        commit: 'older123',
        timestamp: 1699000000,
        message: 'Release 1.1.0',
      },
      { name: 'v1.0.0', commit: 'initial123', timestamp: 1698000000 },
    ],
  };

  const mockStatusResult = {
    currentBranch: 'main',
    isClean: true,
    stagedChanges: {},
    unstagedChanges: {},
    untrackedFiles: [],
    conflictedFiles: [],
  };

  beforeEach(() => {
    mockProvider.resetMocks();
    mockStorage.clearAll();

    container.clearInstances();
    container.register(GitProviderFactoryToken, { useValue: mockFactory });
    container.register(StorageServiceToken, { useValue: mockStorage });

    const tenantId = 'test-tenant';
    const context = createTestContext({ tenantId });
    mockStorage.set(`session:workingDir:${tenantId}`, '/test/repo', context);

    mockProvider.log.mockResolvedValue(mockLogResult);
    mockProvider.tag.mockResolvedValue(mockTagResult);
    mockProvider.status.mockResolvedValue(mockStatusResult);
  });

  describe('Input Schema', () => {
    it('requires at least one review type', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: [],
      });
      expect(result.success).toBe(false);
    });

    it('accepts a single review type', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: ['security'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts multiple review types', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: ['security', 'gaps', 'storyline'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reviewTypes).toEqual([
          'security',
          'gaps',
          'storyline',
        ]);
      }
    });

    it('accepts all six review types', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: [
          'security',
          'features',
          'storyline',
          'gaps',
          'breaking_changes',
          'quality',
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid review types', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: ['invalid_type'],
      });
      expect(result.success).toBe(false);
    });

    it('applies default maxCommits of 200', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: ['gaps'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxCommits).toBe(200);
      }
    });

    it('accepts custom maxCommits', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: ['gaps'],
        maxCommits: 50,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxCommits).toBe(50);
      }
    });

    it('rejects maxCommits above 1000', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: ['gaps'],
        maxCommits: 1001,
      });
      expect(result.success).toBe(false);
    });

    it('rejects maxCommits below 1', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: ['gaps'],
        maxCommits: 0,
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional sinceTag', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: ['gaps'],
        sinceTag: 'v1.0.0',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sinceTag).toBe('v1.0.0');
      }
    });

    it('accepts optional branch', () => {
      const result = gitChangelogAnalyzeTool.inputSchema.safeParse({
        path: '.',
        reviewTypes: ['storyline'],
        branch: 'develop',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.branch).toBe('develop');
      }
    });
  });

  describe('Tool Logic', () => {
    it('fetches commits, tags, and status in parallel', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['gaps'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitChangelogAnalyzeTool.logic(parsedInput, appContext, sdkContext);

      expect(mockProvider.log).toHaveBeenCalledTimes(1);
      expect(mockProvider.tag).toHaveBeenCalledTimes(1);
      expect(mockProvider.status).toHaveBeenCalledTimes(1);
    });

    it('passes maxCommits to provider.log', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['security'],
        maxCommits: 50,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitChangelogAnalyzeTool.logic(parsedInput, appContext, sdkContext);

      const [logOptions] = mockProvider.log.mock.calls[0]!;
      expect(logOptions.maxCount).toBe(50);
    });

    it('uses sinceTag as range when provided', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['gaps'],
        sinceTag: 'v1.0.0',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitChangelogAnalyzeTool.logic(parsedInput, appContext, sdkContext);

      const [logOptions] = mockProvider.log.mock.calls[0]!;
      expect(logOptions.branch).toBe('v1.0.0..HEAD');
    });

    it('uses branch when provided without sinceTag', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['storyline'],
        branch: 'develop',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitChangelogAnalyzeTool.logic(parsedInput, appContext, sdkContext);

      const [logOptions] = mockProvider.log.mock.calls[0]!;
      expect(logOptions.branch).toBe('develop');
    });

    it('sinceTag takes precedence over branch', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['gaps'],
        sinceTag: 'v1.0.0',
        branch: 'develop',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitChangelogAnalyzeTool.logic(parsedInput, appContext, sdkContext);

      const [logOptions] = mockProvider.log.mock.calls[0]!;
      expect(logOptions.branch).toBe('v1.0.0..HEAD');
    });

    it('returns structured git context with commits', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['security'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitChangelogAnalyzeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.gitContext.currentBranch).toBe('main');
      expect(result.gitContext.totalCommitsFetched).toBe(3);
      expect(result.gitContext.commits).toHaveLength(3);
      expect(result.gitContext.commits[0]!.hash).toBe('abc123d');
      expect(result.gitContext.commits[0]!.subject).toBe(
        'feat: add authentication module',
      );
    });

    it('returns structured git context with tags', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['storyline'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitChangelogAnalyzeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.gitContext.tags).toHaveLength(3);
      expect(result.gitContext.tags[0]!.name).toBe('v1.2.0');
      expect(result.gitContext.tags[1]!.message).toBe('Release 1.1.0');
    });

    it('omits empty refs from commit summaries', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['gaps'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitChangelogAnalyzeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      // First commit has refs ['HEAD', 'main']
      expect(result.gitContext.commits[0]!.refs).toEqual(['HEAD', 'main']);
      // Second commit has empty refs - should be omitted
      expect(result.gitContext.commits[1]!.refs).toBeUndefined();
    });

    it('echoes back requested review types', async () => {
      const reviewTypes = ['security', 'gaps', 'quality'] as const;
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: [...reviewTypes],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitChangelogAnalyzeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.reviewTypes).toEqual(['security', 'gaps', 'quality']);
    });

    it('handles empty commit history', async () => {
      mockProvider.log.mockResolvedValue({ commits: [], totalCount: 0 });

      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['storyline'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitChangelogAnalyzeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.gitContext.commits).toHaveLength(0);
      expect(result.gitContext.totalCommitsFetched).toBe(0);
    });

    it('handles empty tag list', async () => {
      mockProvider.tag.mockResolvedValue({ mode: 'list', tags: [] });

      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['gaps'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitChangelogAnalyzeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.gitContext.tags).toHaveLength(0);
    });

    it('handles undefined tags from provider', async () => {
      mockProvider.tag.mockResolvedValue({ mode: 'list' });

      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['storyline'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitChangelogAnalyzeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.gitContext.tags).toHaveLength(0);
    });
  });

  describe('Review Instructions', () => {
    it('includes instructions for each requested review type', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['security', 'features'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitChangelogAnalyzeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.reviewInstructions).toContain('Security Review');
      expect(result.reviewInstructions).toContain('Feature Trajectory Review');
    });

    it('does not include instructions for non-requested types', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: ['storyline'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitChangelogAnalyzeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.reviewInstructions).toContain('Project Storyline Review');
      expect(result.reviewInstructions).not.toContain('Security Review');
      expect(result.reviewInstructions).not.toContain('Gap Analysis');
    });

    it('generates instructions for all six review types', async () => {
      const parsedInput = gitChangelogAnalyzeTool.inputSchema.parse({
        path: '.',
        reviewTypes: [
          'security',
          'features',
          'storyline',
          'gaps',
          'breaking_changes',
          'quality',
        ],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitChangelogAnalyzeTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.reviewInstructions).toContain('Security Review');
      expect(result.reviewInstructions).toContain('Feature Trajectory Review');
      expect(result.reviewInstructions).toContain('Project Storyline Review');
      expect(result.reviewInstructions).toContain('Gap Analysis');
      expect(result.reviewInstructions).toContain('Breaking Changes Review');
      expect(result.reviewInstructions).toContain('Quality Trends Review');
    });
  });

  describe('Response Formatter', () => {
    it('formats output as JSON with git context', () => {
      const result = {
        success: true,
        reviewTypes: ['security' as const],
        gitContext: {
          currentBranch: 'main',
          totalCommitsFetched: 1,
          commits: [
            {
              hash: 'abc123d',
              subject: 'fix: security patch',
              author: 'Casey',
              timestamp: 1700000000,
            },
          ],
          tags: [{ name: 'v1.0.0', commit: 'init123' }],
        },
        reviewInstructions: '## Security Review\nTest instructions',
      };

      const content = gitChangelogAnalyzeTool.responseFormatter!(result);

      assertJsonContent(content, { success: true });
      assertJsonField(content, 'reviewTypes', ['security']);
      assertJsonField(content, 'gitContext', expect.any(Object));
      assertLlmFriendlyFormat(content);
    });

    it('formats output with empty arrays', () => {
      const result = {
        success: true,
        reviewTypes: ['gaps' as const],
        gitContext: {
          currentBranch: 'main',
          totalCommitsFetched: 0,
          commits: [],
          tags: [],
        },
        reviewInstructions: '## Gap Analysis\nTest',
      };

      const content = gitChangelogAnalyzeTool.responseFormatter!(result);

      const parsed = parseJsonContent(content) as {
        gitContext: { commits: unknown[]; tags: unknown[] };
      };
      expect(parsed.gitContext.commits).toHaveLength(0);
      expect(parsed.gitContext.tags).toHaveLength(0);
      assertLlmFriendlyFormat(content);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitChangelogAnalyzeTool.name).toBe('git_changelog_analyze');
    });

    it('is marked as read-only', () => {
      expect(gitChangelogAnalyzeTool.annotations?.readOnlyHint).toBe(true);
    });

    it('has descriptive title and description', () => {
      expect(gitChangelogAnalyzeTool.title).toBe('Git Changelog Analyze');
      expect(gitChangelogAnalyzeTool.description).toBeTruthy();
      expect(gitChangelogAnalyzeTool.description.toLowerCase()).toContain(
        'changelog',
      );
    });

    it('has valid schemas', () => {
      expect(gitChangelogAnalyzeTool.inputSchema).toBeDefined();
      expect(gitChangelogAnalyzeTool.outputSchema).toBeDefined();

      const inputShape = gitChangelogAnalyzeTool.inputSchema.shape;
      expect(inputShape.reviewTypes).toBeDefined();
      expect(inputShape.maxCommits).toBeDefined();
      expect(inputShape.sinceTag).toBeDefined();

      const outputShape = gitChangelogAnalyzeTool.outputSchema.shape;
      expect(outputShape.gitContext).toBeDefined();
      expect(outputShape.reviewInstructions).toBeDefined();
    });
  });
});
