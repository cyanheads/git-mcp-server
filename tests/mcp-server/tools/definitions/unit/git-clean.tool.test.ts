/**
 * @fileoverview Unit tests for git-clean tool
 * @module tests/mcp-server/tools/definitions/unit/git-clean.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitCleanTool } from '@/mcp-server/tools/definitions/git-clean.tool.js';
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
import type { GitCleanResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_clean tool', () => {
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
    it('validates correct input with force=true', () => {
      const input = { path: '.', force: true };
      const result = gitCleanTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dryRun).toBe(false);
        expect(result.data.directories).toBe(false);
        expect(result.data.ignored).toBe(false);
      }
    });

    it('rejects force=false', () => {
      const input = { path: '.', force: false };
      const result = gitCleanTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects missing force flag (defaults to false which fails refinement)', () => {
      const input = { path: '.' };
      const result = gitCleanTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts all boolean options', () => {
      const input = {
        path: '.',
        force: true,
        dryRun: true,
        directories: true,
        ignored: true,
      };
      const result = gitCleanTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects invalid input types', () => {
      const result = gitCleanTool.inputSchema.safeParse({ path: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('executes clean operation successfully with session path', async () => {
      const mockCleanResult: GitCleanResult = {
        success: true,
        filesRemoved: ['temp.txt'],
        directoriesRemoved: ['build/'],
        dryRun: false,
      };

      mockProvider.clean.mockResolvedValue(mockCleanResult);

      const parsedInput = gitCleanTool.inputSchema.parse({
        path: '.',
        force: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitCleanTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.clean).toHaveBeenCalledTimes(1);
      assertProviderCalledWithContext(
        mockProvider.clean.mock.calls[0] as unknown[],
        '/test/repo',
        'test-tenant',
      );

      expect(result).toMatchObject({
        success: true,
        filesRemoved: ['temp.txt'],
        directoriesRemoved: ['build/'],
        dryRun: false,
      });
    });

    it('executes clean with absolute path', async () => {
      const mockCleanResult: GitCleanResult = {
        success: true,
        filesRemoved: [],
        directoriesRemoved: [],
        dryRun: true,
      };

      mockProvider.clean.mockResolvedValue(mockCleanResult);

      const parsedInput = gitCleanTool.inputSchema.parse({
        path: '/absolute/repo/path',
        force: true,
        dryRun: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitCleanTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.clean).toHaveBeenCalledTimes(1);
      const [_options, context] = mockProvider.clean.mock.calls[0] as [
        unknown,
        { workingDirectory: string },
      ];
      expect(context.workingDirectory).toBe('/absolute/repo/path');
      expect(result.dryRun).toBe(true);
    });

    it('passes directories and ignored options to provider', async () => {
      const mockCleanResult: GitCleanResult = {
        success: true,
        filesRemoved: ['ignored.log'],
        directoriesRemoved: ['dist/'],
        dryRun: false,
      };

      mockProvider.clean.mockResolvedValue(mockCleanResult);

      const parsedInput = gitCleanTool.inputSchema.parse({
        path: '.',
        force: true,
        directories: true,
        ignored: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitCleanTool.logic(parsedInput, appContext, sdkContext);

      const [options] = mockProvider.clean.mock.calls[0]!;
      expect(options.directories).toBe(true);
      expect(options.ignored).toBe(true);
    });
  });

  describe('Response Formatter', () => {
    it('formats clean output correctly', () => {
      const result = {
        success: true,
        filesRemoved: ['temp.txt'],
        directoriesRemoved: ['build/'],
        dryRun: false,
      };

      const content = gitCleanTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
        dryRun: false,
      });

      assertJsonField(content, 'filesRemoved', ['temp.txt']);
      assertJsonField(content, 'directoriesRemoved', ['build/']);
      assertLlmFriendlyFormat(content);
    });

    it('formats dry-run output', () => {
      const result = {
        success: true,
        filesRemoved: ['would-remove.txt'],
        directoriesRemoved: [],
        dryRun: true,
      };

      const content = gitCleanTool.responseFormatter!(result);

      assertJsonField(content, 'dryRun', true);
      assertLlmFriendlyFormat(content);
    });

    it('formats clean with no removed items', () => {
      const result = {
        success: true,
        filesRemoved: [],
        directoriesRemoved: [],
        dryRun: false,
      };

      const content = gitCleanTool.responseFormatter!(result);

      const parsed = parseJsonContent(content) as {
        filesRemoved: string[];
        directoriesRemoved: string[];
      };
      expect(parsed.filesRemoved).toHaveLength(0);
      expect(parsed.directoriesRemoved).toHaveLength(0);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitCleanTool.name).toBe('git_clean');
    });

    it('is not marked as read-only', () => {
      expect(gitCleanTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitCleanTool.title).toBeTruthy();
      expect(gitCleanTool.description).toBeTruthy();
      expect(gitCleanTool.description.length).toBeGreaterThan(20);
    });

    it('has valid input and output schemas', () => {
      expect(gitCleanTool.inputSchema).toBeDefined();
      expect(gitCleanTool.outputSchema).toBeDefined();
    });
  });
});
