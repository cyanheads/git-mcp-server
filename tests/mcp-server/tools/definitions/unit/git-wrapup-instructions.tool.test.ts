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
  assertJsonContent,
  assertJsonField,
  parseJsonContent,
  assertLlmFriendlyFormat,
} from '../helpers/index.js';
import type { GitStatusResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

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
    it('accepts uppercase Y acknowledgement', () => {
      const result = gitWrapupInstructionsTool.inputSchema.safeParse({
        acknowledgement: 'Y',
      });
      expect(result.success).toBe(true);
    });

    it('accepts lowercase y acknowledgement', () => {
      const result = gitWrapupInstructionsTool.inputSchema.safeParse({
        acknowledgement: 'y',
      });
      expect(result.success).toBe(true);
    });

    it('accepts Yes acknowledgement', () => {
      const result = gitWrapupInstructionsTool.inputSchema.safeParse({
        acknowledgement: 'Yes',
      });
      expect(result.success).toBe(true);
    });

    it('accepts yes acknowledgement', () => {
      const result = gitWrapupInstructionsTool.inputSchema.safeParse({
        acknowledgement: 'yes',
      });
      expect(result.success).toBe(true);
    });

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

    it('accepts createTag: true', () => {
      const result = gitWrapupInstructionsTool.inputSchema.safeParse({
        acknowledgement: 'Y',
        createTag: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createTag).toBe(true);
      }
    });

    it('accepts createTag: false', () => {
      const result = gitWrapupInstructionsTool.inputSchema.safeParse({
        acknowledgement: 'Y',
        createTag: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createTag).toBe(false);
      }
    });
  });

  describe('Tool Logic', () => {
    it('returns instructions with git status', async () => {
      const mockStatusResult: GitStatusResult = {
        currentBranch: 'main',
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
      };

      mockProvider.status.mockResolvedValue(mockStatusResult);

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
      expect(result.instructions.length).toBeGreaterThan(100);
      expect(result.gitStatus).toBeDefined();
      expect(result.gitStatus!.branch).toBe('main');
      expect(result.gitStatus!.staged).toContain('new-file.txt');
      expect(result.gitStatus!.unstaged).toContain('unstaged.txt');
      expect(result.gitStatus!.untracked).toContain('untracked.txt');
      expect(result.gitStatusError).toBeUndefined();
    });

    it('returns instructions without status when no working directory set', async () => {
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
      expect(result.gitStatus).toBeUndefined();
      expect(result.gitStatusError).toContain('No working directory set');
    });

    it('default instructions include the full acceptance protocol', async () => {
      mockProvider.status.mockResolvedValue({
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
      expect(result.instructions).toContain('**Philosophy**');
      expect(result.instructions).toContain('## Orient');
      expect(result.instructions).toContain('## Acceptance criteria');
      expect(result.instructions).toContain('Every wrap-up is a release');
      expect(result.instructions).toContain('Full diff reviewed');
      expect(result.instructions).toContain('Version bumped per semver');
      expect(result.instructions).toContain("project's existing format");
      expect(result.instructions).toContain(
        'Documentation that references changed behaviour',
      );
      expect(result.instructions).toContain('Verification suite passes');
      expect(result.instructions).toContain('Conventional Commits');
      expect(result.instructions).toContain('Commonly relevant files');
      expect(result.instructions).toContain('AGENTS.md');
      expect(result.instructions).toContain('CLAUDE.md');
      expect(result.instructions).toContain('server.json');
      expect(result.instructions).toContain('## Constraints');
    });

    it('default (createTag unset) includes the tag criterion', async () => {
      mockProvider.status.mockResolvedValue({
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

      expect(result.instructions).toContain('Annotated tag');
      expect(result.instructions).toContain('Flag if a tag already exists');
    });

    it('createTag: true includes the tag criterion', async () => {
      mockProvider.status.mockResolvedValue({
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
      mockProvider.status.mockResolvedValue({
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
      expect(result.instructions).not.toContain('Flag if a tag already exists');
      // Other acceptance criteria remain present
      expect(result.instructions).toContain('Full diff reviewed');
      expect(result.instructions).toContain('Conventional Commits');
    });

    it('handles status retrieval failure gracefully', async () => {
      mockProvider.status.mockRejectedValue(new Error('Git error'));

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
      expect(result.gitStatus).toBeUndefined();
      expect(result.gitStatusError).toContain('Failed to get git status');
    });
  });

  describe('Response Formatter', () => {
    it('formats instructions with git status', () => {
      const result = {
        instructions: '# Git Wrap-up\n\nSome instructions here...',
        gitStatus: {
          branch: 'main',
          staged: ['staged.txt'],
          unstaged: ['unstaged.txt'],
          untracked: ['untracked.txt'],
        },
        gitStatusError: undefined,
      };

      const content = gitWrapupInstructionsTool.responseFormatter!(result);

      const parsed = parseJsonContent(content) as {
        instructions: string;
        gitStatus: { branch: string };
      };

      expect(parsed.instructions).toContain('Wrap-up');
      expect(parsed.gitStatus.branch).toBe('main');

      assertLlmFriendlyFormat(content);
    });

    it('formats instructions with error', () => {
      const result = {
        instructions: '# Git Wrap-up\n\nSome instructions here...',
        gitStatus: undefined,
        gitStatusError:
          'No working directory set for session, git status skipped.',
      };

      const content = gitWrapupInstructionsTool.responseFormatter!(result);

      assertJsonContent(content, {
        instructions: result.instructions,
      });

      assertJsonField(
        content,
        'gitStatusError',
        'No working directory set for session, git status skipped.',
      );
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
      expect(outputShape.gitStatus).toBeDefined();
      expect(outputShape.gitStatusError).toBeDefined();
    });
  });
});
