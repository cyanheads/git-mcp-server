/**
 * @fileoverview Unit tests for git-validators (pure tool-layer validators)
 * @module tests/mcp-server/tools/utils/git-validators.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  resolveWorkingDirectory,
  isProtectedBranch,
  validateProtectedBranchOperation,
  validateFilePath,
  validateCommitMessage,
} from '@/mcp-server/tools/utils/git-validators.js';
import { McpError } from '@/types-global/errors.js';
import { requestContextService } from '@/utils/index.js';
import type { RequestContext } from '@/utils/index.js';

function createContext(tenantId?: string): RequestContext {
  const ctx = requestContextService.createRequestContext({
    operation: 'validator-test',
  });
  if (tenantId) {
    return { ...ctx, tenantId };
  }
  return ctx;
}

describe('isProtectedBranch', () => {
  it('returns true for default protected branches', () => {
    expect(isProtectedBranch('main')).toBe(true);
    expect(isProtectedBranch('master')).toBe(true);
    expect(isProtectedBranch('production')).toBe(true);
    expect(isProtectedBranch('prod')).toBe(true);
    expect(isProtectedBranch('develop')).toBe(true);
    expect(isProtectedBranch('dev')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isProtectedBranch('MAIN')).toBe(true);
    expect(isProtectedBranch('Main')).toBe(true);
  });

  it('returns false for non-protected branches', () => {
    expect(isProtectedBranch('feature/new-thing')).toBe(false);
    expect(isProtectedBranch('bugfix/fix-123')).toBe(false);
    expect(isProtectedBranch('my-branch')).toBe(false);
  });

  it('uses custom config when provided', () => {
    const config = {
      protectedBranches: ['release', 'staging'],
      enforce: true,
    };
    expect(isProtectedBranch('release', config)).toBe(true);
    expect(isProtectedBranch('main', config)).toBe(false);
  });
});

describe('validateProtectedBranchOperation', () => {
  it('throws when operating on protected branch without confirmation', () => {
    expect(() =>
      validateProtectedBranchOperation('main', 'force push', false),
    ).toThrow(McpError);
  });

  it('does not throw when operation is confirmed', () => {
    expect(() =>
      validateProtectedBranchOperation('main', 'force push', true),
    ).not.toThrow();
  });

  it('does not throw for non-protected branches', () => {
    expect(() =>
      validateProtectedBranchOperation('feature/x', 'force push', false),
    ).not.toThrow();
  });

  it('does not throw when enforcement is disabled', () => {
    const config = {
      protectedBranches: ['main'],
      enforce: false,
    };
    expect(() =>
      validateProtectedBranchOperation('main', 'force push', false, config),
    ).not.toThrow();
  });

  it('includes branch and operation in error data', () => {
    try {
      validateProtectedBranchOperation('main', 'reset --hard', false);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      const mcpErr = err as McpError;
      expect(mcpErr.message).toContain('main');
      expect(mcpErr.message).toContain('reset --hard');
    }
  });
});

describe('validateFilePath', () => {
  it('accepts valid relative paths', () => {
    expect(() => validateFilePath('src/index.ts', '/repo')).not.toThrow();
    expect(() => validateFilePath('README.md', '/repo')).not.toThrow();
    expect(() =>
      validateFilePath('src/utils/helper.ts', '/repo'),
    ).not.toThrow();
  });

  it('rejects directory traversal', () => {
    expect(() => validateFilePath('../etc/passwd', '/repo')).toThrow(McpError);
    expect(() => validateFilePath('src/../../secret', '/repo')).toThrow(
      McpError,
    );
  });

  it('rejects absolute paths', () => {
    expect(() => validateFilePath('/etc/passwd', '/repo')).toThrow(McpError);
  });

  it('rejects null bytes', () => {
    expect(() => validateFilePath('file\x00.txt', '/repo')).toThrow(McpError);
  });
});

describe('validateCommitMessage', () => {
  it('accepts valid commit messages', () => {
    expect(() => validateCommitMessage('feat: add new feature')).not.toThrow();
    expect(() => validateCommitMessage('fix: resolve bug')).not.toThrow();
  });

  it('rejects empty messages', () => {
    expect(() => validateCommitMessage('')).toThrow(McpError);
  });

  it('rejects whitespace-only messages', () => {
    expect(() => validateCommitMessage('   ')).toThrow(McpError);
    expect(() => validateCommitMessage('\n\t')).toThrow(McpError);
  });

  it('rejects messages exceeding max length', () => {
    const longMessage = 'a'.repeat(10001);
    expect(() => validateCommitMessage(longMessage)).toThrow(McpError);
  });

  it('accepts messages at custom max length', () => {
    expect(() => validateCommitMessage('short', 5)).not.toThrow();
    expect(() => validateCommitMessage('toolong', 5)).toThrow(McpError);
  });
});

describe('resolveWorkingDirectory', () => {
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
  });

  it('loads from session storage when path is "."', async () => {
    mockStorage.get.mockResolvedValue('/stored/repo');
    const ctx = createContext('test-tenant');

    const result = await resolveWorkingDirectory('.', ctx, mockStorage as any);

    expect(mockStorage.get).toHaveBeenCalledWith(
      'session:workingDir:test-tenant',
      expect.objectContaining({ tenantId: 'test-tenant' }),
    );
    expect(result).toBe('/stored/repo');
  });

  it('throws when path is "." and no session directory is set', async () => {
    mockStorage.get.mockResolvedValue(null);
    const ctx = createContext('test-tenant');

    await expect(
      resolveWorkingDirectory('.', ctx, mockStorage as any),
    ).rejects.toThrow(McpError);
  });

  it('uses absolute path directly when provided', async () => {
    const ctx = createContext('test-tenant');

    const result = await resolveWorkingDirectory(
      '/absolute/path',
      ctx,
      mockStorage as any,
    );

    expect(mockStorage.get).not.toHaveBeenCalled();
    expect(result).toBe('/absolute/path');
  });

  it('defaults tenantId to "default-tenant" when missing', async () => {
    mockStorage.get.mockResolvedValue('/default/repo');
    const ctx = createContext(); // no tenantId

    await resolveWorkingDirectory('.', ctx, mockStorage as any);

    expect(mockStorage.get).toHaveBeenCalledWith(
      'session:workingDir:default-tenant',
      expect.objectContaining({ tenantId: 'default-tenant' }),
    );
  });
});
