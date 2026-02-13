/**
 * @fileoverview Unit tests for git-clear-working-dir tool
 * @module tests/mcp-server/tools/definitions/unit/git-clear-working-dir.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitClearWorkingDirTool } from '@/mcp-server/tools/definitions/git-clear-working-dir.tool.js';
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
  assertLlmFriendlyFormat,
} from '../helpers/index.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_clear_working_dir tool', () => {
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

    // Set up a working directory to clear
    const tenantId = 'test-tenant';
    const context = createTestContext({ tenantId });
    mockStorage.set(`session:workingDir:${tenantId}`, '/test/repo', context);
  });

  describe('Input Schema', () => {
    it('accepts uppercase Y', () => {
      const result = gitClearWorkingDirTool.inputSchema.safeParse({
        confirm: 'Y',
      });
      expect(result.success).toBe(true);
    });

    it('accepts lowercase y', () => {
      const result = gitClearWorkingDirTool.inputSchema.safeParse({
        confirm: 'y',
      });
      expect(result.success).toBe(true);
    });

    it('accepts Yes', () => {
      const result = gitClearWorkingDirTool.inputSchema.safeParse({
        confirm: 'Yes',
      });
      expect(result.success).toBe(true);
    });

    it('accepts yes', () => {
      const result = gitClearWorkingDirTool.inputSchema.safeParse({
        confirm: 'yes',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid confirmation value', () => {
      const result = gitClearWorkingDirTool.inputSchema.safeParse({
        confirm: 'no',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty string', () => {
      const result = gitClearWorkingDirTool.inputSchema.safeParse({
        confirm: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing confirm', () => {
      const result = gitClearWorkingDirTool.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects invalid type', () => {
      const result = gitClearWorkingDirTool.inputSchema.safeParse({
        confirm: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('clears working directory and returns previous path', async () => {
      const parsedInput = gitClearWorkingDirTool.inputSchema.parse({
        confirm: 'Y',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitClearWorkingDirTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.previousPath).toBe('/test/repo');
      expect(result.message).toContain('/test/repo');

      // Verify storage was cleared
      const storedPath = await mockStorage.get<string>(
        'session:workingDir:test-tenant',
        appContext,
      );
      expect(storedPath).toBeNull();
    });

    it('handles case when no working directory was set', async () => {
      // Clear the pre-set working directory first
      const clearContext = createTestContext({ tenantId: 'test-tenant' });
      await mockStorage.delete('session:workingDir:test-tenant', clearContext);

      const parsedInput = gitClearWorkingDirTool.inputSchema.parse({
        confirm: 'Y',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitClearWorkingDirTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.previousPath).toBeUndefined();
      expect(result.message).toContain('No previous path was set');
    });

    it('applies graceful tenantId default when missing', async () => {
      // Set working dir for default tenant
      const defaultContext = createTestContext();
      await mockStorage.set(
        'session:workingDir:default-tenant',
        '/default/repo',
        defaultContext,
      );

      const parsedInput = gitClearWorkingDirTool.inputSchema.parse({
        confirm: 'Y',
      });
      const appContext = createTestContext();
      const sdkContext = createTestSdkContext();

      const result = await gitClearWorkingDirTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.success).toBe(true);
      expect(result.previousPath).toBe('/default/repo');

      // Verify it was cleared
      const storedPath = await mockStorage.get<string>(
        'session:workingDir:default-tenant',
        appContext,
      );
      expect(storedPath).toBeNull();
    });
  });

  describe('Response Formatter', () => {
    it('formats result with previous path', () => {
      const result = {
        success: true,
        message: 'Working directory cleared. Previous path was: /test/repo',
        previousPath: '/test/repo',
      };

      const content = gitClearWorkingDirTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
      });

      assertJsonField(content, 'previousPath', '/test/repo');
      assertJsonField(
        content,
        'message',
        'Working directory cleared. Previous path was: /test/repo',
      );

      assertLlmFriendlyFormat(content);
    });

    it('formats result without previous path', () => {
      const result = {
        success: true,
        message: 'Working directory cleared. No previous path was set.',
        previousPath: undefined,
      };

      const content = gitClearWorkingDirTool.responseFormatter!(result);

      assertJsonContent(content, {
        success: true,
      });

      assertJsonField(
        content,
        'message',
        'Working directory cleared. No previous path was set.',
      );
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitClearWorkingDirTool.name).toBe('git_clear_working_dir');
    });

    it('is marked as write operation', () => {
      expect(gitClearWorkingDirTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitClearWorkingDirTool.title).toBe('Git Clear Working Directory');
      expect(gitClearWorkingDirTool.description).toBeTruthy();
      expect(gitClearWorkingDirTool.description.toLowerCase()).toContain(
        'clear',
      );
    });

    it('has valid input and output schemas', () => {
      expect(gitClearWorkingDirTool.inputSchema).toBeDefined();
      expect(gitClearWorkingDirTool.outputSchema).toBeDefined();

      const inputShape = gitClearWorkingDirTool.inputSchema.shape;
      expect(inputShape.confirm).toBeDefined();

      const outputShape = gitClearWorkingDirTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.message).toBeDefined();
      expect(outputShape.previousPath).toBeDefined();
    });
  });
});
