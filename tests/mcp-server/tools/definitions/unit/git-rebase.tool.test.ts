/**
 * @fileoverview Unit tests for git-rebase tool
 * @module tests/mcp-server/tools/definitions/unit/git-rebase.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitRebaseTool } from '@/mcp-server/tools/definitions/git-rebase.tool.js';
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
import type { GitRebaseResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_rebase tool', () => {
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
      const input = { path: '.', upstream: 'main' };
      const result = gitRebaseTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('start');
        expect(result.data.interactive).toBe(false);
        expect(result.data.preserve).toBe(false);
      }
    });

    it('accepts absolute path', () => {
      const input = { path: '/absolute/path/to/repo', upstream: 'main' };
      const result = gitRebaseTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts all valid mode values', () => {
      for (const mode of ['start', 'continue', 'abort', 'skip'] as const) {
        const result = gitRebaseTool.inputSchema.safeParse({ path: '.', mode });
        expect(result.success).toBe(true);
      }
    });

    it('accepts all optional fields', () => {
      const input = {
        path: '.',
        mode: 'start' as const,
        upstream: 'main',
        branch: 'feature',
        interactive: true,
        onto: 'develop',
        preserve: true,
      };
      const result = gitRebaseTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects invalid mode', () => {
      const result = gitRebaseTool.inputSchema.safeParse({
        path: '.',
        mode: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid input types', () => {
      const result = gitRebaseTool.inputSchema.safeParse({ path: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes rebase operation successfully with session path', async () => {
      const mockRebaseResult: GitRebaseResult = {
        success: true,
        conflicts: false,
        conflictedFiles: [],
        rebasedCommits: 3,
        currentCommit: 'abc123',
      };

      mockProvider.rebase.mockResolvedValue(mockRebaseResult);

      const parsedInput = gitRebaseTool.inputSchema.parse({
        path: '.',
        upstream: 'main',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitRebaseTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.rebase).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.rebase.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        conflicts: false,
        conflictedFiles: [],
        rebasedCommits: 3,
        currentCommit: 'abc123',
      });
    });

    it('executes rebase with absolute path', async () => {
      const mockRebaseResult: GitRebaseResult = {
        success: true,
        conflicts: false,
        conflictedFiles: [],
        rebasedCommits: 1,
      };

      mockProvider.rebase.mockResolvedValue(mockRebaseResult);

      const parsedInput = gitRebaseTool.inputSchema.parse({
        path: '/absolute/repo/path',
        upstream: 'develop',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitRebaseTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.rebase).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.rebase.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
      expect(result.rebasedCommits).toBe(1);
    });

    it('passes mode and onto options to provider', async () => {
      const mockRebaseResult: GitRebaseResult = {
        success: true,
        conflicts: false,
        conflictedFiles: [],
        rebasedCommits: 5,
      };

      mockProvider.rebase.mockResolvedValue(mockRebaseResult);

      const parsedInput = gitRebaseTool.inputSchema.parse({
        path: '.',
        mode: 'start',
        upstream: 'main',
        onto: 'develop',
        preserve: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitRebaseTool.logic(parsedInput, appContext, sdkContext);

      const [options] = mockProvider.rebase.mock.calls[0]!;
      expect(options.mode).toBe('start');
      expect(options.upstream).toBe('main');
      expect(options.onto).toBe('develop');
      expect(options.preserve).toBe(true);
    });

    it('handles continue mode', async () => {
      const mockRebaseResult: GitRebaseResult = {
        success: true,
        conflicts: false,
        conflictedFiles: [],
        rebasedCommits: 2,
      };

      mockProvider.rebase.mockResolvedValue(mockRebaseResult);

      const parsedInput = gitRebaseTool.inputSchema.parse({
        path: '.',
        mode: 'continue',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitRebaseTool.logic(parsedInput, appContext, sdkContext);

      const [options] = mockProvider.rebase.mock.calls[0]!;
      expect(options.mode).toBe('continue');
    });
  });

  describe('Response Formatter', () => {
    it('formats successful rebase output correctly', () => {
      const result = {
        success: true,
        conflicts: false,
        conflictedFiles: [],
        rebasedCommits: 3,
        currentCommit: 'abc123',
      };

      const content = gitRebaseTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        conflicts: false,
        rebasedCommits: 3,
      });

      assertJsonField(content, 'currentCommit', 'abc123');
      assertLlmFriendlyFormat(content);
    });

    it('formats rebase with conflicts', () => {
      const result = {
        success: true,
        conflicts: true,
        conflictedFiles: ['src/index.ts', 'src/app.ts'],
        rebasedCommits: 1,
        currentCommit: 'def456',
      };

      const content = gitRebaseTool.responseFormatter!(result);

      assertJsonField(content, 'conflicts', true);
      assertJsonField(content, 'conflictedFiles', [
        'src/index.ts',
        'src/app.ts',
      ]);

      const parsed = parseJsonContent(content) as {
        conflictedFiles: string[];
      };
      expect(parsed.conflictedFiles).toHaveLength(2);
      assertLlmFriendlyFormat(content);
    });

    it('formats rebase without currentCommit', () => {
      const result = {
        success: true,
        conflicts: false,
        conflictedFiles: [],
        rebasedCommits: 0,
      };

      const content = gitRebaseTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        conflicts: false,
        rebasedCommits: 0,
      });
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitRebaseTool.name).toBe('git_rebase');
    });

    it('is not marked as read-only', () => {
      expect(gitRebaseTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitRebaseTool.title).toBeTruthy();
      expect(gitRebaseTool.description).toBeTruthy();
      expect(gitRebaseTool.description.length).toBeGreaterThan(20);
    });

    it('has valid input and output schemas', () => {
      expect(gitRebaseTool.inputSchema).toBeDefined();
      expect(gitRebaseTool.outputSchema).toBeDefined();
    });
  });
});
