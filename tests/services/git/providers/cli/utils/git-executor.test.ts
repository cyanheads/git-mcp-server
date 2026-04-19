/**
 * @fileoverview Unit tests for executeGitCommand cwd validation
 * @module tests/services/git/providers/cli/utils/git-executor.test
 */
import { describe, expect, it } from 'vitest';

import { executeGitCommand } from '@/services/git/providers/cli/utils/git-executor.js';
import { McpError } from '@/types-global/errors.js';

describe('executeGitCommand cwd pre-flight', () => {
  it('throws a clear error when cwd does not exist (not generic "Git not found")', async () => {
    await expect(
      executeGitCommand(['status'], '/definitely/not/a/real/path/xyz123'),
    ).rejects.toThrow(McpError);

    try {
      await executeGitCommand(['status'], '/definitely/not/a/real/path/xyz123');
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('Working directory does not exist');
      expect(message).not.toContain('Git command not found');
    }
  });

  it('throws when cwd exists but is not a directory', async () => {
    await expect(executeGitCommand(['status'], '/etc/hosts')).rejects.toThrow(
      /not a directory/,
    );
  });
});
