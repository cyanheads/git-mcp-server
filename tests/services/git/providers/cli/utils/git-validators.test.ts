/**
 * @fileoverview Runs the pre-flight validators against a real git binary on
 * temp repositories — no `execGit` mock — so every probe they emit
 * (`rev-parse --is-inside-work-tree`, `--show-toplevel`, `--verify`) goes
 * through the real `validateGitArgs` allow-list. 2.15.2 shipped with
 * `--is-inside-work-tree` missing from the list and no test on this path.
 * @module tests/services/git/providers/cli/utils/git-validators.test
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getGitRoot,
  validateBranchExists,
  validateCommitRef,
  validateGitRepository,
} from '@/services/git/providers/cli/utils/git-validators.js';
import { McpError } from '@/types-global/errors.js';
import { createTestContext } from '../../../../../mcp-server/tools/definitions/helpers/testContext.js';

function git(args: string[], cwd: string): void {
  const proc = Bun.spawnSync(['git', ...args], { cwd });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${proc.stderr.toString()}`);
  }
}

describe('git validators against a real git binary', () => {
  const context = createTestContext();
  let root: string;
  let repoDir: string;
  let emptyDir: string;

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'git-validators-')));
    repoDir = join(root, 'repo');
    emptyDir = join(root, 'empty');
    mkdirSync(repoDir);
    mkdirSync(emptyDir);
    git(['init', '-q', '-b', 'main'], repoDir);
    git(['config', 'user.email', 'e2e@example.com'], repoDir);
    git(['config', 'user.name', 'e2e'], repoDir);
    git(['commit', '-q', '--allow-empty', '--message=init'], repoDir);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('validateGitRepository accepts a real repository', async () => {
    await expect(validateGitRepository(repoDir, context)).resolves.toBe(true);
  });

  it('validateGitRepository accepts a subdirectory of a repository', async () => {
    const sub = join(repoDir, 'sub');
    mkdirSync(sub);
    await expect(validateGitRepository(sub, context)).resolves.toBe(true);
  });

  it('validateGitRepository reports a plain directory as not a repository — not as a rejected flag', async () => {
    const outcome = await validateGitRepository(emptyDir, context).then(
      () => null,
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(McpError);
    expect((outcome as McpError).message).toMatch(/not a git repository/i);
    expect((outcome as McpError).message).not.toMatch(/Unsafe git flag/i);
  });

  it('validateGitRepository names a missing path as missing', async () => {
    await expect(
      validateGitRepository(join(root, 'does-not-exist'), context),
    ).rejects.toThrow(/does not exist/);
  });

  it('getGitRoot resolves the top-level directory (rev-parse --show-toplevel)', async () => {
    await expect(getGitRoot(join(repoDir, 'sub'), context)).resolves.toBe(
      repoDir,
    );
  });

  it('validateBranchExists and validateCommitRef run rev-parse --verify', async () => {
    await expect(
      validateBranchExists('main', repoDir, context),
    ).resolves.toBeUndefined();
    await expect(
      validateBranchExists('nope', repoDir, context),
    ).rejects.toThrow(/does not exist/);
    await expect(validateCommitRef('HEAD', repoDir, context)).resolves.toBe(
      true,
    );
  });
});
