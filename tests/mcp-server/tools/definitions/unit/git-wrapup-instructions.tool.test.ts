/**
 * @fileoverview Unit tests for git-wrapup-instructions tool
 * @module tests/mcp-server/tools/definitions/unit/git-wrapup-instructions.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitWrapupInstructionsTool } from '@/mcp-server/tools/definitions/git-wrapup-instructions.tool.js';
import {
  GitProviderFactory as GitProviderFactoryToken,
  StorageService as StorageServiceToken,
} from '@/container/tokens.js';
import {
  createTestContext,
  createTestSdkContext,
  createMockGitProvider,
  createMockStorageService,
  parseJsonContent,
  assertLlmFriendlyFormat,
} from '../helpers/index.js';
import type {
  GitLogResult,
  GitStatusResult,
  GitTagResult,
} from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const logResult: GitLogResult = {
  commits: [
    {
      hash: 'abc123def456',
      shortHash: 'abc123d',
      author: 'Test User',
      authorEmail: 'test@example.com',
      timestamp: 1704067200,
      subject: 'feat: initial commit',
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
      message: 'First release',
      annotationBody: 'Signed off for production.',
      tagger: 'Test User <test@example.com>',
      timestamp: 1704067200,
    },
  ],
};

function primeSnapshotMocks(
  mockProvider: ReturnType<typeof createMockGitProvider>,
  status: GitStatusResult,
) {
  mockProvider.status.mockResolvedValue(status);
  mockProvider.log.mockResolvedValue(logResult);
  mockProvider.tag.mockResolvedValue(tagResult);
}

describe('git_wrapup_instructions tool', () => {
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
    it.each([['Y'], ['y'], ['Yes'], ['yes']])(
      'accepts %s acknowledgement',
      (ack) => {
        const result = gitWrapupInstructionsTool.inputSchema.safeParse({
          acknowledgement: ack,
        });
        expect(result.success).toBe(true);
      },
    );

    it('rejects invalid acknowledgement', () => {
      const result = gitWrapupInstructionsTool.inputSchema.safeParse({
        acknowledgement: 'no',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing acknowledgement', () => {
      const result = gitWrapupInstructionsTool.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts createTag: true/false', () => {
      const okTrue = gitWrapupInstructionsTool.inputSchema.safeParse({
        acknowledgement: 'Y',
        createTag: true,
      });
      const okFalse = gitWrapupInstructionsTool.inputSchema.safeParse({
        acknowledgement: 'Y',
        createTag: false,
      });
      expect(okTrue.success).toBe(true);
      expect(okFalse.success).toBe(true);
    });
  });

  describe('Tool Logic', () => {
    it('returns instructions with repository snapshot', async () => {
      primeSnapshotMocks(mockProvider, {
        currentBranch: 'main',
        upstream: 'origin/main',
        ahead: 0,
        behind: 0,
        isClean: false,
        stagedChanges: {
          added: ['new-file.txt'],
          modified: ['changed.txt'],
        },
        unstagedChanges: {
          modified: ['unstaged.txt'],
        },
        untrackedFiles: ['untracked.txt'],
        conflictedFiles: [],
      });

      const parsedInput = gitWrapupInstructionsTool.inputSchema.parse({
        acknowledgement: 'Y',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitWrapupInstructionsTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.instructions).toBeTruthy();
      expect(result.repository).toBeDefined();
      expect(result.repository!.status.branch).toBe('main');
      expect(result.repository!.status.upstream).toBe('origin/main');
      expect(result.repository!.status.staged).toContain('new-file.txt');
      expect(result.repository!.status.unstaged).toContain('unstaged.txt');
      expect(result.repository!.status.untracked).toContain('untracked.txt');
      expect(result.repository!.recentCommits).toHaveLength(1);
      expect(result.repository!.recentTags[0]!.annotationSubject).toBe(
        'First release',
      );
      expect(result.repository!.recentTags[0]!.annotationBody).toBe(
        'Signed off for production.',
      );
      expect(result.enrichmentWarnings).toBeUndefined();
    });

    it('emits an actionable warning when no working directory is set', async () => {
      const clearContext = createTestContext({ tenantId: 'test-tenant' });
      await mockStorage.delete('session:workingDir:test-tenant', clearContext);

      const parsedInput = gitWrapupInstructionsTool.inputSchema.parse({
        acknowledgement: 'Y',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitWrapupInstructionsTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.instructions).toBeTruthy();
      expect(result.repository).toBeUndefined();
      expect(result.enrichmentWarnings).toHaveLength(1);
      expect(result.enrichmentWarnings![0]).toContain('git_set_working_dir');
    });

    it('default instructions include the full acceptance protocol', async () => {
      primeSnapshotMocks(mockProvider, {
        currentBranch: 'main',
        isClean: true,
        stagedChanges: {},
        unstagedChanges: {},
        untrackedFiles: [],
        conflictedFiles: [],
      });

      const parsedInput = gitWrapupInstructionsTool.inputSchema.parse({
        acknowledgement: 'Y',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitWrapupInstructionsTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.instructions).toContain('# Git Wrap-up');
      expect(result.instructions).toContain('**Outcome**');
      expect(result.instructions).toContain('## Orient');
      expect(result.instructions).toContain('## Acceptance criteria');
      expect(result.instructions).toContain('Full diff reviewed');
      expect(result.instructions).toContain('Conventional Commits');
      expect(result.instructions).toContain('## Constraints');
    });

    it('createTag: true includes the tag criterion', async () => {
      primeSnapshotMocks(mockProvider, {
        currentBranch: 'main',
        isClean: true,
        stagedChanges: {},
        unstagedChanges: {},
        untrackedFiles: [],
        conflictedFiles: [],
      });

      const parsedInput = gitWrapupInstructionsTool.inputSchema.parse({
        acknowledgement: 'Y',
        createTag: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitWrapupInstructionsTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.instructions).toContain('Annotated tag');
    });

    it('createTag: false omits the tag criterion entirely', async () => {
      primeSnapshotMocks(mockProvider, {
        currentBranch: 'main',
        isClean: true,
        stagedChanges: {},
        unstagedChanges: {},
        untrackedFiles: [],
        conflictedFiles: [],
      });

      const parsedInput = gitWrapupInstructionsTool.inputSchema.parse({
        acknowledgement: 'Y',
        createTag: false,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitWrapupInstructionsTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.instructions).not.toContain('Annotated tag');
      expect(result.instructions).toContain('Full diff reviewed');
    });

    it('surfaces partial snapshot failures as warnings', async () => {
      mockProvider.status.mockResolvedValue({
        currentBranch: 'main',
        isClean: true,
        stagedChanges: {},
        unstagedChanges: {},
        untrackedFiles: [],
        conflictedFiles: [],
      });
      mockProvider.log.mockResolvedValue(logResult);
      mockProvider.tag.mockRejectedValue(new Error('tag listing exploded'));

      const parsedInput = gitWrapupInstructionsTool.inputSchema.parse({
        acknowledgement: 'Y',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitWrapupInstructionsTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.repository).toBeDefined();
      expect(result.repository!.recentTags).toEqual([]);
      expect(result.enrichmentWarnings).toBeDefined();
      expect(result.enrichmentWarnings!.some((w) => w.includes('tag'))).toBe(
        true,
      );
    });
  });

  describe('Response Formatter', () => {
    it('formats instructions with repository snapshot', () => {
      const result = {
        instructions: '# Git Wrap-up\n\nSome instructions here...',
        repository: {
          status: {
            branch: 'main',
            isClean: false,
            staged: ['staged.txt'],
            unstaged: ['unstaged.txt'],
            untracked: ['untracked.txt'],
            conflicts: [],
          },
          recentCommits: [
            {
              hash: 'abc123d',
              author: 'Test User',
              date: '2024-01-01T00:00:00.000Z',
              subject: 'feat: initial commit',
            },
          ],
          recentTags: [
            {
              name: 'v1.0.0',
              date: '2024-01-01T00:00:00.000Z',
              annotationSubject: 'First release',
              annotationBody: 'Signed off for production.',
            },
          ],
        },
      };

      const content = gitWrapupInstructionsTool.responseFormatter!(result);

      const parsed = parseJsonContent(content) as {
        instructions: string;
        repository: {
          status: { branch: string };
          recentTags: Array<{ annotationBody: string }>;
        };
      };

      expect(parsed.instructions).toContain('Wrap-up');
      expect(parsed.repository.status.branch).toBe('main');
      expect(parsed.repository.recentTags[0]!.annotationBody).toBe(
        'Signed off for production.',
      );
      assertLlmFriendlyFormat(content);
    });

    it('formats instructions with enrichment warning', () => {
      const result = {
        instructions: '# Git Wrap-up\n\nSome instructions here...',
        enrichmentWarnings: [
          'No session working directory set. Call git_set_working_dir first to include a repository snapshot (status, recent commits, recent tags) in this response.',
        ],
      };

      const content = gitWrapupInstructionsTool.responseFormatter!(result);
      const parsed = parseJsonContent(content) as {
        instructions: string;
        enrichmentWarnings: string[];
      };

      expect(parsed.enrichmentWarnings[0]).toContain('git_set_working_dir');
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitWrapupInstructionsTool.name).toBe('git_wrapup_instructions');
    });

    it('has correct read-only annotation', () => {
      expect(gitWrapupInstructionsTool.annotations?.readOnlyHint).toBe(true);
    });

    it('has descriptive title and description', () => {
      expect(gitWrapupInstructionsTool.title).toBe('Git Wrap-up Instructions');
      expect(gitWrapupInstructionsTool.description).toBeTruthy();
      expect(gitWrapupInstructionsTool.description.toLowerCase()).toContain(
        'wrap-up',
      );
    });

    it('has valid input and output schemas', () => {
      expect(gitWrapupInstructionsTool.inputSchema).toBeDefined();
      expect(gitWrapupInstructionsTool.outputSchema).toBeDefined();

      const inputShape = gitWrapupInstructionsTool.inputSchema.shape;
      expect(inputShape.acknowledgement).toBeDefined();
      expect(inputShape.createTag).toBeDefined();

      const outputShape = gitWrapupInstructionsTool.outputSchema.shape;
      expect(outputShape.instructions).toBeDefined();
      expect(outputShape.repository).toBeDefined();
      expect(outputShape.enrichmentWarnings).toBeDefined();
    });
  });
});
