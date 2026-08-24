/**
 * @fileoverview Drives every tool through the real server over stdio against
 * real temp repositories, so each tool's actual argv passes through the real
 * `validateGitArgs` allow-list. Mocked-`execGit` unit tests cannot see a flag
 * the allow-list omits; 2.15.2 shipped `git_set_working_dir` broken on every
 * path that way. This suite fails the moment any tool's real invocation is
 * rejected — and pins the leading-dash message contract (schemas accept a
 * message starting with `-`, so the operations must emit it attached).
 * @module tests/mcp-server/transports/stdio/tool-argv.e2e.test
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { allToolDefinitions } from '@/mcp-server/tools/definitions/index.js';

const TIMEOUT_MS = 30_000;
const DASH_MESSAGE = '-fix: message that starts with a dash';

function git(args: string[], cwd: string): string {
  const proc = Bun.spawnSync(['git', ...args], { cwd });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString().trim();
}

describe('stdio transport: every tool runs through the real argument validator', () => {
  let client: Client;
  let root: string;
  let repoDir: string;
  let remoteDir: string;
  let cloneDir: string;
  let freshDir: string;
  let emptyDir: string;
  let worktreeDir: string;
  const called = new Set<string>();

  /** Call a tool, assert it succeeded and its output never mentions a rejected flag. */
  async function call(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    called.add(name);
    const result = await client.callTool({ name, arguments: args });
    const text = JSON.stringify(result);
    expect(text, `${name} ${JSON.stringify(args)}`).not.toMatch(
      /Unsafe git flag/i,
    );
    expect(
      result.isError,
      `${name} ${JSON.stringify(args)} → ${text}`,
    ).toBeFalsy();
    return (result.structuredContent ?? {}) as Record<string, unknown>;
  }

  /** Call a tool that is expected to fail; return the error text. */
  async function callExpectingError(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    called.add(name);
    const result = await client
      .callTool({ name, arguments: args })
      .catch((error: unknown) => ({
        isError: true,
        content: [{ type: 'text', text: String(error) }],
      }));
    expect(result.isError).toBe(true);
    return JSON.stringify(result.content);
  }

  beforeAll(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'git-mcp-argv-e2e-')));
    repoDir = join(root, 'repo');
    remoteDir = join(root, 'remote.git');
    cloneDir = join(root, 'clone');
    freshDir = join(root, 'fresh');
    emptyDir = join(root, 'empty');
    worktreeDir = join(root, 'wt');
    mkdirSync(repoDir);
    mkdirSync(emptyDir);

    git(['init', '-q', '-b', 'main'], repoDir);
    git(['config', 'user.email', 'e2e@example.com'], repoDir);
    git(['config', 'user.name', 'e2e'], repoDir);
    git(['config', 'commit.gpgsign', 'false'], repoDir);
    git(['config', 'tag.gpgsign', 'false'], repoDir);
    writeFileSync(join(repoDir, 'README.md'), '# e2e\n');
    git(['add', 'README.md'], repoDir);
    git(['commit', '-q', '--message=first commit'], repoDir);
    writeFileSync(join(repoDir, 'README.md'), '# e2e\n\nsecond line\n');
    git(['commit', '-q', '-a', '--message=second commit'], repoDir);
    git(['init', '-q', '--bare', remoteDir], root);

    const env = { ...(process.env as Record<string, string>) };
    delete env.GIT_BASE_DIR;
    delete env.GIT_SIGN_COMMITS;
    client = new Client({ name: 'tool-argv-e2e', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: 'bun',
        args: ['src/index.ts'],
        cwd: process.cwd(),
        env: { ...env, MCP_TRANSPORT_TYPE: 'stdio', MCP_LOG_LEVEL: 'error' },
        stderr: 'pipe',
      }),
    );
  }, TIMEOUT_MS);

  afterAll(async () => {
    await client?.close();
    rmSync(root, { recursive: true, force: true });
  });

  // --- git_set_working_dir: the 2.15.2 regression -------------------------

  it(
    'git_set_working_dir with default validation accepts a real repository',
    async () => {
      const out = await call('git_set_working_dir', { path: repoDir });
      expect(out.success).toBe(true);
      expect(out.repository).toBeDefined();
      expect(out.enrichmentWarnings).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  it(
    'git_set_working_dir on a plain directory reports "not a git repository" with the init hint',
    async () => {
      const text = await callExpectingError('git_set_working_dir', {
        path: emptyDir,
      });
      expect(text).toMatch(/not a git repository/i);
      expect(text).toMatch(/initializeIfNotPresent/);
      expect(text).not.toMatch(/Unsafe git flag/i);
    },
    TIMEOUT_MS,
  );

  it(
    'git_set_working_dir with initializeIfNotPresent initializes a plain directory',
    async () => {
      const out = await call('git_set_working_dir', {
        path: emptyDir,
        initializeIfNotPresent: true,
      });
      expect(out.success).toBe(true);
      expect(existsSync(join(emptyDir, '.git'))).toBe(true);
      await call('git_set_working_dir', { path: repoDir });
    },
    TIMEOUT_MS,
  );

  // --- read-only history tools -------------------------------------------

  it(
    'status / log / show / diff / blame / reflog',
    async () => {
      const status = await call('git_status');
      expect(status.isClean).toBe(true);

      const log = await call('git_log', {
        maxCount: 2,
        since: '10 years ago',
        author: 'e2e',
        grep: 'commit',
      });
      expect(JSON.stringify(log)).toContain('second commit');
      await call('git_log', { grep: '-dash', author: '-nobody' });
      await call('git_log', {
        filePath: 'README.md',
        oneline: true,
        stat: true,
      });

      await call('git_show', { object: 'HEAD' });
      await call('git_show', { object: 'HEAD', filePath: 'README.md' });
      await call('git_diff', { target: 'HEAD~1' });
      await call('git_diff', { target: 'HEAD~1', source: 'HEAD', stat: true });
      await call('git_diff', { staged: true, nameOnly: true });
      await call('git_blame', {
        filePath: 'README.md',
        startLine: 1,
        endLine: 1,
      });
      await call('git_blame', {
        filePath: 'README.md',
        ignoreWhitespace: true,
      });
      await call('git_reflog', { maxCount: 3 });
      await call('git_reflog', { ref: 'main' });
    },
    TIMEOUT_MS,
  );

  // --- messages that start with "-" reach git as data ---------------------

  it(
    'git_add + git_commit with a leading-dash message',
    async () => {
      writeFileSync(join(repoDir, 'note.txt'), 'note\n');
      await call('git_add', { paths: ['note.txt'] });
      const commit = await call('git_commit', {
        message: DASH_MESSAGE,
        author: { name: 'e2e', email: 'e2e@example.com' },
      });
      expect(commit.success).toBe(true);
      expect(git(['log', '-1', '--format=%s'], repoDir)).toBe(DASH_MESSAGE);
    },
    TIMEOUT_MS,
  );

  it(
    'git_tag create/list/delete with a leading-dash message',
    async () => {
      await call('git_tag', {
        mode: 'create',
        tagName: 'v0.0.1',
        message: DASH_MESSAGE,
        annotated: true,
      });
      expect(
        git(['tag', '-l', '--format=%(contents:subject)', 'v0.0.1'], repoDir),
      ).toBe(DASH_MESSAGE);
      const list = await call('git_tag', { mode: 'list' });
      expect(JSON.stringify(list)).toContain('v0.0.1');
      await call('git_tag', { mode: 'delete', tagName: 'v0.0.1' });
    },
    TIMEOUT_MS,
  );

  it(
    'git_stash push/list/pop with a leading-dash message',
    async () => {
      writeFileSync(join(repoDir, 'note.txt'), 'note changed\n');
      await call('git_stash', { mode: 'push', message: DASH_MESSAGE });
      expect(git(['stash', 'list', '--format=%s'], repoDir)).toContain(
        DASH_MESSAGE,
      );
      const list = await call('git_stash', { mode: 'list', limit: 5 });
      expect(JSON.stringify(list)).toContain(DASH_MESSAGE);
      await call('git_stash', { mode: 'pop' });
      git(['checkout', '--', 'note.txt'], repoDir);
    },
    TIMEOUT_MS,
  );

  // --- branches: create / checkout / merge / cherry-pick / rebase / reset --

  it(
    'git_branch + git_checkout + git_merge with a leading-dash message',
    async () => {
      await call('git_branch', { mode: 'create', branchName: 'feature' });
      const list = await call('git_branch', {
        mode: 'list',
        merged: true,
        limit: 10,
      });
      expect(JSON.stringify(list)).toContain('feature');
      await call('git_branch', { mode: 'show-current' });
      await call('git_checkout', { target: 'feature' });
      writeFileSync(join(repoDir, 'feature.txt'), 'feature\n');
      await call('git_add', { all: true });
      await call('git_commit', { message: 'feature commit' });
      await call('git_checkout', { target: 'main' });
      const merge = await call('git_merge', {
        branch: 'feature',
        noFastForward: true,
        message: DASH_MESSAGE,
      });
      expect(merge.success).toBe(true);
      expect(git(['log', '-1', '--format=%s'], repoDir)).toBe(DASH_MESSAGE);
      await call('git_branch', {
        mode: 'rename',
        branchName: 'feature',
        newBranchName: 'feature-done',
      });
      await call('git_branch', { mode: 'delete', branchName: 'feature-done' });
    },
    TIMEOUT_MS,
  );

  it(
    'git_cherry_pick',
    async () => {
      await call('git_checkout', { target: 'cp', createBranch: true });
      writeFileSync(join(repoDir, 'cp.txt'), 'cherry\n');
      await call('git_add', { paths: ['cp.txt'] });
      await call('git_commit', { message: 'cherry commit' });
      const sha = git(['rev-parse', 'HEAD'], repoDir);
      await call('git_checkout', { target: 'main' });
      await call('git_cherry_pick', { commits: [sha], signoff: true });
      expect(existsSync(join(repoDir, 'cp.txt'))).toBe(true);
    },
    TIMEOUT_MS,
  );

  it(
    'git_rebase',
    async () => {
      await call('git_checkout', { target: 'rb', createBranch: true });
      writeFileSync(join(repoDir, 'rb.txt'), 'rebase\n');
      await call('git_add', { paths: ['rb.txt'] });
      await call('git_commit', { message: 'rebase commit' });
      await call('git_checkout', { target: 'main' });
      writeFileSync(join(repoDir, 'main.txt'), 'main\n');
      await call('git_add', { paths: ['main.txt'] });
      await call('git_commit', { message: 'main moves on' });
      await call('git_checkout', { target: 'rb' });
      const rebase = await call('git_rebase', {
        mode: 'start',
        upstream: 'main',
      });
      expect(rebase.success).toBe(true);
      await call('git_checkout', { target: 'main' });
    },
    TIMEOUT_MS,
  );

  it(
    'git_reset (soft, mixed, paths) and git_clean --dry-run',
    async () => {
      await call('git_reset', { mode: 'soft', target: 'HEAD' });
      await call('git_reset', { mode: 'mixed', target: 'HEAD' });
      writeFileSync(join(repoDir, 'note.txt'), 'staged change\n');
      git(['add', 'note.txt'], repoDir);
      await call('git_reset', { paths: ['note.txt'] });
      git(['checkout', '--', 'note.txt'], repoDir);
      writeFileSync(join(repoDir, 'junk.tmp'), 'junk\n');
      await call('git_clean', { dryRun: true, force: true });
      await call('git_clean', { force: true });
      expect(existsSync(join(repoDir, 'junk.tmp'))).toBe(false);
    },
    TIMEOUT_MS,
  );

  it(
    'git_worktree add/list/remove/prune',
    async () => {
      await call('git_worktree', {
        mode: 'add',
        worktreePath: worktreeDir,
        branch: 'wt-branch',
      });
      const list = await call('git_worktree', { mode: 'list', verbose: true });
      expect(JSON.stringify(list)).toContain('wt-branch');
      await call('git_worktree', {
        mode: 'remove',
        worktreePath: worktreeDir,
        force: true,
      });
      await call('git_worktree', { mode: 'prune', dryRun: true });
    },
    TIMEOUT_MS,
  );

  // --- remotes: add / push / fetch / pull / clone ---------------------------

  it(
    'git_remote + git_push + git_fetch + git_pull against a local bare remote',
    async () => {
      await call('git_remote', { mode: 'add', name: 'origin', url: remoteDir });
      const list = await call('git_remote', { mode: 'list' });
      expect(JSON.stringify(list)).toContain(remoteDir);
      await call('git_remote', { mode: 'get-url', name: 'origin' });
      await call('git_push', {
        remote: 'origin',
        branch: 'main',
        setUpstream: true,
        confirmed: true,
      });
      await call('git_push', {
        remote: 'origin',
        tags: true,
        dryRun: true,
        confirmed: true,
      });
      await call('git_fetch', { remote: 'origin', prune: true, tags: true });
      await call('git_pull', { remote: 'origin', branch: 'main' });
      await call('git_remote', {
        mode: 'rename',
        name: 'origin',
        newName: 'upstream',
      });
      await call('git_remote', {
        mode: 'set-url',
        name: 'upstream',
        url: remoteDir,
      });
      await call('git_remote', {
        mode: 'rename',
        name: 'upstream',
        newName: 'origin',
      });
    },
    TIMEOUT_MS,
  );

  it(
    'git_clone from the local bare remote and git_init with an initial branch',
    async () => {
      const clone = await call('git_clone', {
        url: remoteDir,
        path: cloneDir,
        branch: 'main',
      });
      expect(clone.success).toBe(true);
      expect(existsSync(join(cloneDir, 'README.md'))).toBe(true);
      await call('git_init', { path: freshDir, initialBranch: 'trunk' });
      expect(git(['symbolic-ref', '--short', 'HEAD'], freshDir)).toBe('trunk');
    },
    TIMEOUT_MS,
  );

  // --- the rest -----------------------------------------------------------

  it(
    'git_changelog_analyze / git_wrapup_instructions / git_clear_working_dir',
    async () => {
      git(['tag', 'v0.1.0'], repoDir);
      await call('git_changelog_analyze', {
        reviewTypes: ['features', 'gaps'],
        maxCommits: 10,
        sinceTag: 'v0.1.0',
      });
      await call('git_wrapup_instructions', { acknowledgement: 'Y' });
      await call('git_clear_working_dir', { confirm: 'Y' });
    },
    TIMEOUT_MS,
  );

  it('exercised every registered tool', () => {
    expect([...called].sort()).toEqual(
      allToolDefinitions.map((tool) => tool.name).sort(),
    );
  });
});
