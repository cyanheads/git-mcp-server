/**
 * @fileoverview Unit tests for git-cherry-pick tool
 * @module tests/mcp-server/tools/definitions/unit/git-cherry-pick.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitCherryPickTool } from '@/mcp-server/tools/definitions/git-cherry-pick.tool.js';
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
import type { GitCherryPickResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_cherry_pick tool', () => {
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
      const input = { path: '.', commits: ['abc123'] };
      const result = gitCherryPickTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.noCommit).toBe(false);
        expect(result.data.continueOperation).toBe(false);
        expect(result.data.abort).toBe(false);
        expect(result.data.signoff).toBe(false);
      }
    });

    it('accepts absolute path', () => {
      const input = { path: '/absolute/path/to/repo', commits: ['abc123'] };
      const result = gitCherryPickTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts multiple commits', () => {
      const input = { path: '.', commits: ['abc123', 'def456', 'ghi789'] };
      const result = gitCherryPickTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects empty commits array', () => {
      const result = gitCherryPickTool.inputSchema.safeParse({
        path: '.',
        commits: [],
      });
      expect(result.success).toBe(false);
    });

    it('accepts mainline option', () => {
      const input = { path: '.', commits: ['abc123'], mainline: 1 };
      const result = gitCherryPickTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects mainline less than 1', () => {
      const result = gitCherryPickTool.inputSchema.safeParse({
        path: '.',
        commits: ['abc123'],
        mainline: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid input types', () => {
      const result = gitCherryPickTool.inputSchema.safeParse({
        path: '.',
        commits: 'not-an-array',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes cherry-pick operation successfully with session path', async () => {
      const mockCherryPickResult: GitCherryPickResult = {
        success: true,
        pickedCommits: ['abc123'],
        conflicts: false,
        conflictedFiles: [],
      };

      mockProvider.cherryPick.mockResolvedValue(mockCherryPickResult);

      const parsedInput = gitCherryPickTool.inputSchema.parse({
        path: '.',
        commits: ['abc123'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitCherryPickTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.cherryPick).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.cherryPick.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        pickedCommits: ['abc123'],
        conflicts: false,
        conflictedFiles: [],
      });
    });

    it('executes cherry-pick with absolute path', async () => {
      const mockCherryPickResult: GitCherryPickResult = {
        success: true,
        pickedCommits: ['abc123', 'def456'],
        conflicts: false,
        conflictedFiles: [],
      };

      mockProvider.cherryPick.mockResolvedValue(mockCherryPickResult);

      const parsedInput = gitCherryPickTool.inputSchema.parse({
        path: '/absolute/repo/path',
        commits: ['abc123', 'def456'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitCherryPickTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.cherryPick).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.cherryPick.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
      expect(result.pickedCommits).toHaveLength(2);
    });

    it('passes noCommit and mainline options to provider', async () => {
      const mockCherryPickResult: GitCherryPickResult = {
        success: true,
        pickedCommits: ['abc123'],
        conflicts: false,
        conflictedFiles: [],
      };

      mockProvider.cherryPick.mockResolvedValue(mockCherryPickResult);

      const parsedInput = gitCherryPickTool.inputSchema.parse({
        path: '.',
        commits: ['abc123'],
        noCommit: true,
        mainline: 1,
        strategy: 'ort',
        signoff: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitCherryPickTool.logic(parsedInput, appContext, sdkContext);

      const [options] = mockProvider.cherryPick.mock.calls[0]!;
      expect(options.noCommit).toBe(true);
      expect(options.mainline).toBe(1);
      expect(options.strategy).toBe('ort');
      expect(options.signoff).toBe(true);
    });
  });

  describe('Response Formatter', () => {
    it('formats successful cherry-pick output correctly', () => {
      const result = {
        success: true,
        pickedCommits: ['abc123'],
        conflicts: false,
        conflictedFiles: [],
      };

      const content = gitCherryPickTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        conflicts: false,
      });

      assertJsonField(content, 'pickedCommits', ['abc123']);
      assertLlmFriendlyFormat(content);
    });

    it('formats cherry-pick with conflicts', () => {
      const result = {
        success: true,
        pickedCommits: [],
        conflicts: true,
        conflictedFiles: ['src/index.ts', 'src/utils.ts'],
      };

      const content = gitCherryPickTool.responseFormatter!(result);

      assertJsonField(content, 'conflicts', true);
      assertJsonField(content, 'conflictedFiles', [
        'src/index.ts',
        'src/utils.ts',
      ]);

      const parsed = parseJsonContent(content) as {
        conflictedFiles: string[];
      };
      expect(parsed.conflictedFiles).toHaveLength(2);
      assertLlmFriendlyFormat(content);
    });

    it('formats cherry-pick with multiple commits', () => {
      const result = {
        success: true,
        pickedCommits: ['abc123', 'def456', 'ghi789'],
        conflicts: false,
        conflictedFiles: [],
      };

      const content = gitCherryPickTool.responseFormatter!(result);

      const parsed = parseJsonContent(content) as {
        pickedCommits: string[];
      };
      expect(parsed.pickedCommits).toHaveLength(3);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitCherryPickTool.name).toBe('git_cherry_pick');
    });

    it('is not marked as read-only', () => {
      expect(gitCherryPickTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitCherryPickTool.title).toBeTruthy();
      expect(gitCherryPickTool.description).toBeTruthy();
      expect(gitCherryPickTool.description.length).toBeGreaterThan(20);
    });

    it('has valid input and output schemas', () => {
      expect(gitCherryPickTool.inputSchema).toBeDefined();
      expect(gitCherryPickTool.outputSchema).toBeDefined();
    });
  });
});
