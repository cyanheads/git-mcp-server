/**
 * @fileoverview CLI-based Git provider implementation
 * @module services/git/providers/cli/CliGitProvider
 *
 * This provider wraps the native git binary for full-featured git operations.
 * It provides all git capabilities by executing git CLI commands.
 *
 * Capabilities:
 * - Full git feature set (all operations supported)
 * - GPG/SSH commit signing
 * - SSH and HTTP/HTTPS authentication
 * - Local-only (not compatible with edge/serverless environments)
 *
 * Trade-offs:
 * - Requires git binary installed on the system
 * - Cannot run in serverless/edge environments
 * - Fastest and most feature-complete option for local development
 */

import { BaseGitProvider } from '../../core/BaseGitProvider.js';
import type { IGitProvider } from '../../core/IGitProvider.js';
import type {
  GitAddOptions,
  GitAddResult,
  GitBlameOptions,
  GitBlameResult,
  GitBranchOptions,
  GitBranchResult,
  GitCherryPickOptions,
  GitCherryPickResult,
  GitCheckoutOptions,
  GitCheckoutResult,
  GitCleanOptions,
  GitCleanResult,
  GitCloneOptions,
  GitCloneResult,
  GitCommitOptions,
  GitCommitResult,
  GitDiffOptions,
  GitDiffResult,
  GitFetchOptions,
  GitFetchResult,
  GitInitOptions,
  GitInitResult,
  GitLogOptions,
  GitLogResult,
  GitMergeOptions,
  GitMergeResult,
  GitOperationContext,
  GitProviderCapabilities,
  GitPullOptions,
  GitPullResult,
  GitPushOptions,
  GitPushResult,
  GitRebaseOptions,
  GitRebaseResult,
  GitReflogOptions,
  GitReflogResult,
  GitRemoteOptions,
  GitRemoteResult,
  GitResetOptions,
  GitResetResult,
  GitShowOptions,
  GitShowResult,
  GitStashOptions,
  GitStashResult,
  GitStatusOptions,
  GitStatusResult,
  GitTagOptions,
  GitTagResult,
  GitWorktreeOptions,
  GitWorktreeResult,
} from '../../types.js';
import {
  executeAdd,
  executeBlame,
  executeBranch,
  executeCherryPick,
  executeCheckout,
  executeClean,
  executeClone,
  executeCommit,
  executeDiff,
  executeFetch,
  executeInit,
  executeLog,
  executeMerge,
  executePull,
  executePush,
  executeRebase,
  executeReflog,
  executeRemote,
  executeReset,
  executeShow,
  executeStash,
  executeStatus,
  executeTag,
  executeWorktree,
} from './operations/index.js';
import {
  executeGitCommand,
  type ExecuteGitOptions,
} from './utils/git-executor.js';
import { validateGitRepository } from './utils/git-validators.js';
import { isGitNotFoundError } from './utils/error-mapper.js';

/**
 * CLI-based git provider using native git binary.
 *
 * This provider is the default for local environments and provides the full
 * git feature set by wrapping the native git command-line tool.
 *
 * @implements {IGitProvider}
 * @extends {BaseGitProvider}
 */
export class CliGitProvider extends BaseGitProvider implements IGitProvider {
  readonly name = 'cli';
  readonly version = '1.0.0';
  readonly capabilities: GitProviderCapabilities = {
    init: true,
    clone: true,
    commit: true,
    branch: true,
    merge: true,
    rebase: true,
    remote: true,
    fetch: true,
    push: true,
    pull: true,
    tag: true,
    stash: true,
    worktree: true,
    blame: true,
    reflog: true,
    signCommits: true,
    sshAuth: true,
    httpAuth: true,
    maxRepoSizeMB: 10000, // 10GB - CLI can handle large repos
  };

  /**
   * Check if git binary is available and functional.
   *
   * @param context - Operation context (can use mock values for health check)
   * @returns Promise resolving to true if git is available
   */
  async healthCheck(context: GitOperationContext): Promise<boolean> {
    try {
      const { stdout } = await executeGitCommand(
        ['--version'],
        context.workingDirectory,
      );
      return stdout.includes('git version');
    } catch (error) {
      if (isGitNotFoundError(error)) {
        this.logOperationStart('healthCheck', context, {
          error: 'Git binary not found',
        });
        return false;
      }
      return false;
    }
  }

  // ========================================================================
  // Repository Operations
  // ========================================================================

  async init(
    options: GitInitOptions,
    context: GitOperationContext,
  ): Promise<GitInitResult> {
    this.logOperationStart('init', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeInit(options, context, executor);
    this.logOperationSuccess('init', context, { path: result.path });
    return result;
  }

  async clone(
    options: GitCloneOptions,
    context: GitOperationContext,
  ): Promise<GitCloneResult> {
    this.logOperationStart('clone', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeClone(options, context, executor);
    this.logOperationSuccess('clone', context, { path: result.localPath });
    return result;
  }

  async status(
    options: GitStatusOptions,
    context: GitOperationContext,
  ): Promise<GitStatusResult> {
    this.logOperationStart('status', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeStatus(options, context, executor);
    this.logOperationSuccess('status', context, { isClean: result.isClean });
    return result;
  }

  async clean(
    options: GitCleanOptions,
    context: GitOperationContext,
  ): Promise<GitCleanResult> {
    this.logOperationStart('clean', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeClean(options, context, executor);
    this.logOperationSuccess('clean', context, {
      filesRemoved: result.filesRemoved.length,
    });
    return result;
  }

  // ========================================================================
  // Commit Operations
  // ========================================================================

  async add(
    options: GitAddOptions,
    context: GitOperationContext,
  ): Promise<GitAddResult> {
    this.logOperationStart('add', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeAdd(options, context, executor);
    this.logOperationSuccess('add', context, {
      filesStaged: result.stagedFiles.length,
    });
    return result;
  }

  async commit(
    options: GitCommitOptions,
    context: GitOperationContext,
  ): Promise<GitCommitResult> {
    this.logOperationStart('commit', context, { message: options.message });
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeCommit(options, context, executor);
    this.logOperationSuccess('commit', context, { hash: result.commitHash });
    return result;
  }

  async log(
    options: GitLogOptions,
    context: GitOperationContext,
  ): Promise<GitLogResult> {
    this.logOperationStart('log', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeLog(options, context, executor);
    this.logOperationSuccess('log', context, {
      commitCount: result.totalCount,
    });
    return result;
  }

  async show(
    options: GitShowOptions,
    context: GitOperationContext,
  ): Promise<GitShowResult> {
    this.logOperationStart('show', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeShow(options, context, executor);
    this.logOperationSuccess('show', context, { object: result.object });
    return result;
  }

  async diff(
    options: GitDiffOptions,
    context: GitOperationContext,
  ): Promise<GitDiffResult> {
    this.logOperationStart('diff', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeDiff(options, context, executor);
    this.logOperationSuccess('diff', context, {
      filesChanged: result.filesChanged,
    });
    return result;
  }

  // ========================================================================
  // Branch Operations
  // ========================================================================

  async branch(
    options: GitBranchOptions,
    context: GitOperationContext,
  ): Promise<GitBranchResult> {
    this.logOperationStart('branch', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeBranch(options, context, executor);
    this.logOperationSuccess('branch', context, { mode: result.mode });
    return result;
  }

  async checkout(
    options: GitCheckoutOptions,
    context: GitOperationContext,
  ): Promise<GitCheckoutResult> {
    this.logOperationStart('checkout', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeCheckout(options, context, executor);
    this.logOperationSuccess('checkout', context, { target: result.target });
    return result;
  }

  async merge(
    options: GitMergeOptions,
    context: GitOperationContext,
  ): Promise<GitMergeResult> {
    this.logOperationStart('merge', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeMerge(options, context, executor);
    this.logOperationSuccess('merge', context, {
      conflicts: result.conflicts,
    });
    return result;
  }

  async rebase(
    options: GitRebaseOptions,
    context: GitOperationContext,
  ): Promise<GitRebaseResult> {
    this.logOperationStart('rebase', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeRebase(options, context, executor);
    this.logOperationSuccess('rebase', context, {
      conflicts: result.conflicts,
    });
    return result;
  }

  async cherryPick(
    options: GitCherryPickOptions,
    context: GitOperationContext,
  ): Promise<GitCherryPickResult> {
    this.logOperationStart('cherryPick', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeCherryPick(options, context, executor);
    this.logOperationSuccess('cherryPick', context, {
      conflicts: result.conflicts,
    });
    return result;
  }

  // ========================================================================
  // Remote Operations
  // ========================================================================

  async remote(
    options: GitRemoteOptions,
    context: GitOperationContext,
  ): Promise<GitRemoteResult> {
    this.logOperationStart('remote', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeRemote(options, context, executor);
    this.logOperationSuccess('remote', context, { mode: result.mode });
    return result;
  }

  async fetch(
    options: GitFetchOptions,
    context: GitOperationContext,
  ): Promise<GitFetchResult> {
    this.logOperationStart('fetch', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeFetch(options, context, executor);
    this.logOperationSuccess('fetch', context, { remote: result.remote });
    return result;
  }

  async push(
    options: GitPushOptions,
    context: GitOperationContext,
  ): Promise<GitPushResult> {
    this.logOperationStart('push', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executePush(options, context, executor);
    this.logOperationSuccess('push', context, {
      success: result.success,
    });
    return result;
  }

  async pull(
    options: GitPullOptions,
    context: GitOperationContext,
  ): Promise<GitPullResult> {
    this.logOperationStart('pull', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executePull(options, context, executor);
    this.logOperationSuccess('pull', context, {
      strategy: result.strategy,
    });
    return result;
  }

  // ========================================================================
  // Tag Operations
  // ========================================================================

  async tag(
    options: GitTagOptions,
    context: GitOperationContext,
  ): Promise<GitTagResult> {
    this.logOperationStart('tag', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeTag(options, context, executor);
    this.logOperationSuccess('tag', context, { mode: result.mode });
    return result;
  }

  // ========================================================================
  // Stash Operations
  // ========================================================================

  async stash(
    options: GitStashOptions,
    context: GitOperationContext,
  ): Promise<GitStashResult> {
    this.logOperationStart('stash', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeStash(options, context, executor);
    this.logOperationSuccess('stash', context, { mode: result.mode });
    return result;
  }

  // ========================================================================
  // Worktree Operations
  // ========================================================================

  async worktree(
    options: GitWorktreeOptions,
    context: GitOperationContext,
  ): Promise<GitWorktreeResult> {
    this.logOperationStart('worktree', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeWorktree(options, context, executor);
    this.logOperationSuccess('worktree', context, { mode: result.mode });
    return result;
  }

  // ========================================================================
  // Additional Operations
  // ========================================================================

  async validateRepository(
    path: string,
    context: GitOperationContext,
  ): Promise<void> {
    this.logOperationStart('validateRepository', context, { path });
    await validateGitRepository(path, context.requestContext);
    this.logOperationSuccess('validateRepository', context, { path });
  }

  async reset(
    options: GitResetOptions,
    context: GitOperationContext,
  ): Promise<GitResetResult> {
    this.logOperationStart('reset', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeReset(options, context, executor);
    this.logOperationSuccess('reset', context, { mode: result.mode });
    return result;
  }

  async blame(
    options: GitBlameOptions,
    context: GitOperationContext,
  ): Promise<GitBlameResult> {
    this.checkCapability('blame');
    this.logOperationStart('blame', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeBlame(options, context, executor);
    this.logOperationSuccess('blame', context, {
      file: result.file,
      lines: result.totalLines,
    });
    return result;
  }

  async reflog(
    options: GitReflogOptions,
    context: GitOperationContext,
  ): Promise<GitReflogResult> {
    this.checkCapability('reflog');
    this.logOperationStart('reflog', context, options);
    const executor = (
      args: string[],
      cwd: string,
      _ctx?: unknown,
      options?: ExecuteGitOptions,
    ) => executeGitCommand(args, cwd, options);
    const result = await executeReflog(options, context, executor);
    this.logOperationSuccess('reflog', context, {
      entries: result.totalEntries,
    });
    return result;
  }
}
