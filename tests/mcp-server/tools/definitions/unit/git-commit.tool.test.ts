/**
 * @fileoverview Unit tests for git-commit tool
 * @module tests/mcp-server/tools/definitions/unit/git-commit.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitCommitTool } from '@/mcp-server/tools/definitions/git-commit.tool.js';
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
import type { GitCommitResult, GitStatusResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_commit tool', () => {
  const mockProvider = createMockGitProvider();
  const mockStorage = createMockStorageService();
  const mockFactory = {
    getProvider: vi.fn(async () => mockProvider),
  } as unknown as GitProviderFactory;

  beforeEach(() => {
    // Reset mocks
    mockProvider.resetMocks();
    mockStorage.clearAll();

    // Register mock dependencies
    container.clearInstances();
    container.register(GitProviderFactoryToken, { useValue: mockFactory });
    container.register(StorageServiceToken, { useValue: mockStorage });

    // Set up default session working directory
    const tenantId = 'test-tenant';
    const context = createTestContext({ tenantId });
    mockStorage.set(`session:workingDir:${tenantId}`, '/test/repo', context);
  });

  describe('Input Schema', () => {
    it('validates correct input with defaults', () => {
      const input = { path: '.', message: 'Test commit' };
      const result = gitCommitTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amend).toBe(false);
        expect(result.data.allowEmpty).toBe(false);
      }
    });

    it('accepts author override', () => {
      const input = {
        path: '.',
        message: 'Test',
        author: { name: 'Test Author', email: 'test@example.com' },
      };
      const result = gitCommitTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.author).toEqual({
          name: 'Test Author',
          email: 'test@example.com',
        });
      }
    });

    it('accepts amend flag', () => {
      const input = { path: '.', message: 'Amended', amend: true };
      const result = gitCommitTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amend).toBe(true);
      }
    });

    it('accepts filesToStage array', () => {
      const input = {
        path: '.',
        message: 'Test',
        filesToStage: ['file1.txt', 'file2.txt'],
      };
      const result = gitCommitTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filesToStage).toEqual(['file1.txt', 'file2.txt']);
      }
    });

    it('rejects invalid message', () => {
      const input = { path: '.', message: '' };
      const result = gitCommitTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid author email', () => {
      const input = {
        path: '.',
        message: 'Test',
        author: { name: 'Test', email: 'not-an-email' },
      };
      const result = gitCommitTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('creates commit successfully', async () => {
      const mockCommitResult: GitCommitResult = {
        success: true,
        commitHash: 'abc123def456',
        message: 'Test commit',
        author: 'Test User <test@example.com>',
        timestamp: 1234567890,
        filesChanged: ['file1.txt', 'file2.txt'],
        signed: false,
      };

      const mockStatusResult: GitStatusResult = {
        currentBranch: 'main',
        isClean: true,
        stagedChanges: {},
        unstagedChanges: {},
        untrackedFiles: [],
        conflictedFiles: [],
      };

      mockProvider.commit.mockResolvedValue(mockCommitResult);
      mockProvider.status.mockResolvedValue(mockStatusResult);

      const parsedInput = gitCommitTool.inputSchema.parse({
        path: '.',
        message: 'Test commit',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitCommitTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      // Verify commit was called
      expect(mockProvider.commit).toHaveBeenCalledTimes(1);
      const [commitOptions, commitContext] = mockProvider.commit.mock.calls[0]!;
      expect(commitOptions.message).toBe('Test commit');
      expect(commitContext.workingDirectory).toBe('/test/repo');

      // Verify status was called after commit
      expect(mockProvider.status).toHaveBeenCalledTimes(1);

      // Verify output
      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc123def456');
      expect(result.status.is_clean).toBe(true);
    });

    it('stages files before committing when filesToStage provided', async () => {
      const mockCommitResult: GitCommitResult = {
        success: true,
        commitHash: 'abc123',
        message: 'Test',
        author: 'Test <test@test.com>',
        timestamp: 123,
        filesChanged: ['file1.txt'],
        signed: false,
      };

      const mockStatusResult: GitStatusResult = {
        currentBranch: 'main',
        isClean: true,
        stagedChanges: {},
        unstagedChanges: {},
        untrackedFiles: [],
        conflictedFiles: [],
      };

      mockProvider.add.mockResolvedValue({
        success: true,
        stagedFiles: ['file1.txt', 'file2.txt'],
      });
      mockProvider.commit.mockResolvedValue(mockCommitResult);
      mockProvider.status.mockResolvedValue(mockStatusResult);

      const parsedInput = gitCommitTool.inputSchema.parse({
        path: '.',
        message: 'Test commit',
        filesToStage: ['file1.txt', 'file2.txt'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitCommitTool.logic(parsedInput, appContext, sdkContext);

      // Verify add was called before commit
      expect(mockProvider.add).toHaveBeenCalledTimes(1);
      const [addOptions] = mockProvider.add.mock.calls[0]!;
      expect(addOptions.paths).toEqual(['file1.txt', 'file2.txt']);

      // Verify commit was called after add
      expect(mockProvider.commit).toHaveBeenCalledTimes(1);
    });

    it('passes author override to provider', async () => {
      const mockCommitResult: GitCommitResult = {
        success: true,
        commitHash: 'abc123',
        message: 'Test',
        author: 'Custom Author <custom@example.com>',
        timestamp: 123,
        filesChanged: [],
        signed: false,
      };

      const mockStatusResult: GitStatusResult = {
        currentBranch: 'main',
        isClean: true,
        stagedChanges: {},
        unstagedChanges: {},
        untrackedFiles: [],
        conflictedFiles: [],
      };

      mockProvider.commit.mockResolvedValue(mockCommitResult);
      mockProvider.status.mockResolvedValue(mockStatusResult);

      const parsedInput = gitCommitTool.inputSchema.parse({
        path: '.',
        message: 'Test commit',
        author: { name: 'Custom Author', email: 'custom@example.com' },
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitCommitTool.logic(parsedInput, appContext, sdkContext);

      const [commitOptions] = mockProvider.commit.mock.calls[0]!;
      expect(commitOptions.author).toEqual({
        name: 'Custom Author',
        email: 'custom@example.com',
      });
    });

    it('passes amend flag to provider', async () => {
      const mockCommitResult: GitCommitResult = {
        success: true,
        commitHash: 'abc123',
        message: 'Amended commit',
        author: 'Test <test@test.com>',
        timestamp: 123,
        filesChanged: [],
        signed: false,
      };

      const mockStatusResult: GitStatusResult = {
        currentBranch: 'main',
        isClean: true,
        stagedChanges: {},
        unstagedChanges: {},
        untrackedFiles: [],
        conflictedFiles: [],
      };

      mockProvider.commit.mockResolvedValue(mockCommitResult);
      mockProvider.status.mockResolvedValue(mockStatusResult);

      const parsedInput = gitCommitTool.inputSchema.parse({
        path: '.',
        message: 'Amended commit',
        amend: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitCommitTool.logic(parsedInput, appContext, sdkContext);

      const [commitOptions] = mockProvider.commit.mock.calls[0]!;
      expect(commitOptions.amend).toBe(true);
    });

    it('uses absolute path when provided', async () => {
      const mockCommitResult: GitCommitResult = {
        success: true,
        commitHash: 'abc123',
        message: 'Test',
        author: 'Test <test@test.com>',
        timestamp: 123,
        filesChanged: [],
        signed: false,
      };

      const mockStatusResult: GitStatusResult = {
        currentBranch: 'main',
        isClean: true,
        stagedChanges: {},
        unstagedChanges: {},
        untrackedFiles: [],
        conflictedFiles: [],
      };

      mockProvider.commit.mockResolvedValue(mockCommitResult);
      mockProvider.status.mockResolvedValue(mockStatusResult);

      const parsedInput = gitCommitTool.inputSchema.parse({
        path: '/absolute/repo/path',
        message: 'Test commit',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitCommitTool.logic(parsedInput, appContext, sdkContext);

      const [_options, commitContext] = mockProvider.commit.mock.calls[0]!;
      expect(commitContext.workingDirectory).toBe('/absolute/repo/path');
    });
  });

  describe('Response Formatter', () => {
    it('formats successful commit with clean status', () => {
      const result = {
        success: true,
        commitHash: 'abc123def456789',
        message: 'Add new feature',
        author: 'Test User <test@example.com>',
        timestamp: 1609459200,
        filesChanged: 3,
        committedFiles: ['file1.txt', 'file2.txt', 'file3.txt'],
        signed: true,
        status: {
          current_branch: 'main',
          staged_changes: {},
          unstaged_changes: {},
          untracked_files: [],
          conflicted_files: [],
          is_clean: true,
        },
      };

      const content = gitCommitTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        commitHash: 'abc123def456789',
        message: 'Add new feature',
        filesChanged: 3,
      });

      assertJsonField(content, 'commitHash', 'abc123def456789');
      assertJsonField(content, 'message', 'Add new feature');
      assertJsonField(content, 'filesChanged', 3);
      assertJsonField(content, 'status.is_clean', true);
      assertLlmFriendlyFormat(content);
    });

    it('formats commit with remaining changes', () => {
      const result = {
        success: true,
        commitHash: 'abc123',
        message: 'Partial commit',
        author: 'Test <test@test.com>',
        timestamp: 1609459200,
        filesChanged: 1,
        committedFiles: ['committed.txt'],
        signed: true,
        status: {
          current_branch: 'develop',
          staged_changes: { added: ['staged.txt'] },
          unstaged_changes: { modified: ['modified.txt'] },
          untracked_files: ['untracked.txt'],
          conflicted_files: [],
          is_clean: false,
        },
      };

      const content = gitCommitTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        commitHash: 'abc123',
        message: 'Partial commit',
      });

      assertJsonField(content, 'status.is_clean', false);
      assertJsonField(content, 'status.current_branch', 'develop');

      const parsed = parseJsonContent(content) as {
        status: { untracked_files: string[] };
      };
      expect(parsed.status.untracked_files).toContain('untracked.txt');
    });

    it('formats commit with file statistics', () => {
      const result = {
        success: true,
        commitHash: 'abc123',
        message: 'Test',
        author: 'Test <test@test.com>',
        timestamp: 1609459200,
        filesChanged: 5,
        committedFiles: ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt'],
        insertions: 100,
        deletions: 50,
        signed: true,
        status: {
          current_branch: 'main',
          staged_changes: {},
          unstaged_changes: {},
          untracked_files: [],
          conflicted_files: [],
          is_clean: true,
        },
      };

      const content = gitCommitTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        commitHash: 'abc123',
        filesChanged: 5,
        insertions: 100,
        deletions: 50,
      });

      assertJsonField(content, 'filesChanged', 5);
      assertJsonField(content, 'insertions', 100);
      assertJsonField(content, 'deletions', 50);
    });

    it('lists all committed files', () => {
      const result = {
        success: true,
        commitHash: 'abc123',
        message: 'Test',
        author: 'Test <test@test.com>',
        timestamp: 1609459200,
        filesChanged: 2,
        committedFiles: ['important.txt', 'feature.js'],
        signed: true,
        status: {
          current_branch: 'main',
          staged_changes: {},
          unstaged_changes: {},
          untracked_files: [],
          conflicted_files: [],
          is_clean: true,
        },
      };

      const content = gitCommitTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        commitHash: 'abc123',
        filesChanged: 2,
      });

      assertJsonField(content, 'committedFiles', [
        'important.txt',
        'feature.js',
      ]);

      const parsed = parseJsonContent(content) as {
        committedFiles: string[];
      };
      expect(parsed.committedFiles).toHaveLength(2);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitCommitTool.name).toBe('git_commit');
    });

    it('is marked as write operation', () => {
      expect(gitCommitTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitCommitTool.title).toBe('Git Commit');
      expect(gitCommitTool.description).toBeTruthy();
      expect(gitCommitTool.description).toContain('commit');
    });

    it('has valid input and output schemas', () => {
      expect(gitCommitTool.inputSchema).toBeDefined();
      expect(gitCommitTool.outputSchema).toBeDefined();

      // Verify key input fields
      const inputShape = gitCommitTool.inputSchema.shape;
      expect(inputShape.message).toBeDefined();
      expect(inputShape.path).toBeDefined();
      expect(inputShape.amend).toBeDefined();

      // Verify key output fields
      const outputShape = gitCommitTool.outputSchema.shape;
      expect(outputShape.commitHash).toBeDefined();
      expect(outputShape.success).toBeDefined();
      expect(outputShape.status).toBeDefined();
    });
  });
});
