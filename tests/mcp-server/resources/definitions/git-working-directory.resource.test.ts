/**
 * @fileoverview Unit tests for git-working-directory resource
 * @module tests/mcp-server/resources/definitions/git-working-directory.resource.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitWorkingDirectoryResource } from '@/mcp-server/resources/definitions/git-working-directory.resource.js';
import { StorageService as StorageServiceToken } from '@/container/tokens.js';
import { requestContextService } from '@/utils/index.js';
import type { RequestContext } from '@/utils/index.js';

function createContext(tenantId?: string): RequestContext {
  const ctx = requestContextService.createRequestContext({
    operation: 'resource-test',
  });
  if (tenantId) return { ...ctx, tenantId };
  return ctx;
}

describe('git-working-directory resource', () => {
  const mockStorage = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getMany: vi.fn(),
    setMany: vi.fn(),
    deleteMany: vi.fn(),
    clear: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    container.clearInstances();
    container.register(StorageServiceToken, { useValue: mockStorage });
  });

  describe('Metadata', () => {
    it('has correct name and URI template', () => {
      expect(gitWorkingDirectoryResource.name).toBe('git-working-directory');
      expect(gitWorkingDirectoryResource.uriTemplate).toBe(
        'git://working-directory',
      );
    });

    it('has read-only annotation', () => {
      expect(gitWorkingDirectoryResource.annotations?.readOnlyHint).toBe(true);
    });

    it('has valid schemas', () => {
      expect(gitWorkingDirectoryResource.paramsSchema).toBeDefined();
      expect(gitWorkingDirectoryResource.outputSchema).toBeDefined();
    });

    it('returns resource list', () => {
      const list = gitWorkingDirectoryResource.list!();
      expect(list.resources).toHaveLength(1);
      expect(list.resources[0]!.uri).toBe('git://working-directory');
    });
  });

  describe('Logic', () => {
    it('returns set directory when one exists in storage', async () => {
      mockStorage.get.mockResolvedValue('/test/repo');

      const uri = new URL('git://working-directory');
      const ctx = createContext('test-tenant');
      const result = (await gitWorkingDirectoryResource.logic(
        uri,
        {},
        ctx,
      )) as {
        isSet: boolean;
        workingDirectory: string | null;
        message: string;
      };

      expect(result.isSet).toBe(true);
      expect(result.workingDirectory).toBe('/test/repo');
      expect(result.message).toContain('/test/repo');
    });

    it('returns null when no directory is set', async () => {
      mockStorage.get.mockResolvedValue(undefined);

      const uri = new URL('git://working-directory');
      const ctx = createContext('test-tenant');
      const result = (await gitWorkingDirectoryResource.logic(
        uri,
        {},
        ctx,
      )) as {
        isSet: boolean;
        workingDirectory: string | null;
        message: string;
      };

      expect(result.isSet).toBe(false);
      expect(result.workingDirectory).toBeNull();
      expect(result.message).toContain('git_set_working_dir');
    });

    it('uses default tenant when tenantId is missing', async () => {
      mockStorage.get.mockResolvedValue(null);

      const uri = new URL('git://working-directory');
      const ctx = createContext(); // no tenantId
      await gitWorkingDirectoryResource.logic(uri, {}, ctx);

      expect(mockStorage.get).toHaveBeenCalledWith(
        'session:workingDir:default-tenant',
        expect.anything(),
      );
    });
  });

  describe('Output Schema', () => {
    it('validates correct output', () => {
      const output = {
        workingDirectory: '/test/repo',
        isSet: true,
        message: 'Working directory is set to: /test/repo',
      };
      const result =
        gitWorkingDirectoryResource.outputSchema!.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('validates null working directory', () => {
      const output = {
        workingDirectory: null,
        isSet: false,
        message: 'No working directory',
      };
      const result =
        gitWorkingDirectoryResource.outputSchema!.safeParse(output);
      expect(result.success).toBe(true);
    });
  });
});
