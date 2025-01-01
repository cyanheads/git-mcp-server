import { BaseGitOperation } from '../base/base-operation.js';
import { GitCommandBuilder } from '../../common/command-builder.js';
import { CommandResult } from '../base/operation-result.js';
import { ErrorHandler } from '../../errors/error-handler.js';
import { RepositoryValidator } from '../../utils/repository.js';
import { CommandExecutor } from '../../utils/command.js';
import { RepoStateType } from '../../caching/repository-cache.js';
import {
  PushOptions,
  PullOptions,
  FetchOptions,
  PushResult,
  PullResult,
  FetchResult
} from './sync-types.js';

/**
 * Handles Git push operations
 */
export class PushOperation extends BaseGitOperation<PushOptions, PushResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.push();

    if (this.options.remote) {
      command.arg(this.options.remote);
    }

    if (this.options.branch) {
      command.arg(this.options.branch);
    }

    if (this.options.force) {
      command.withForce();
    }

    if (this.options.forceWithLease) {
      command.flag('force-with-lease');
    }

    if (this.options.all) {
      command.flag('all');
    }

    if (this.options.tags) {
      command.flag('tags');
    }

    if (this.options.noVerify) {
      command.withNoVerify();
    }

    if (this.options.setUpstream) {
      command.withSetUpstream();
    }

    if (this.options.prune) {
      command.flag('prune');
    }

    return command;
  }

  protected parseResult(result: CommandResult): PushResult {
    const summary = {
      created: [] as string[],
      deleted: [] as string[],
      updated: [] as string[],
      rejected: [] as string[]
    };

    // Parse push output
    result.stdout.split('\n').forEach(line => {
      if (line.startsWith('To ')) return; // Skip remote URL line

      const match = line.match(/^\s*([a-f0-9]+)\.\.([a-f0-9]+)\s+(\S+)\s+->\s+(\S+)/);
      if (match) {
        const [, oldRef, newRef, localRef, remoteRef] = match;
        summary.updated.push(remoteRef);
      } else if (line.includes('[new branch]')) {
        const branchMatch = line.match(/\[new branch\]\s+(\S+)\s+->\s+(\S+)/);
        if (branchMatch) {
          summary.created.push(branchMatch[2]);
        }
      } else if (line.includes('[deleted]')) {
        const deleteMatch = line.match(/\[deleted\]\s+(\S+)/);
        if (deleteMatch) {
          summary.deleted.push(deleteMatch[1]);
        }
      } else if (line.includes('! [rejected]')) {
        const rejectMatch = line.match(/\! \[rejected\]\s+(\S+)/);
        if (rejectMatch) {
          summary.rejected.push(rejectMatch[1]);
        }
      }
    });

    return {
      remote: this.options.remote || 'origin',
      branch: this.options.branch,
      forced: this.options.force || false,
      summary: {
        created: summary.created.length > 0 ? summary.created : undefined,
        deleted: summary.deleted.length > 0 ? summary.deleted : undefined,
        updated: summary.updated.length > 0 ? summary.updated : undefined,
        rejected: summary.rejected.length > 0 ? summary.rejected : undefined
      },
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'push',
      stateType: RepoStateType.REMOTE
    };
  }

  protected async validateOptions(): Promise<void> {
    if (!this.options.branch && !this.options.all) {
      throw ErrorHandler.handleValidationError(
        new Error('Either branch or --all must be specified'),
        { operation: this.context.operation }
      );
    }

    if (this.options.remote) {
      await RepositoryValidator.validateRemoteConfig(
        this.getResolvedPath(),
        this.options.remote,
        this.context.operation
      );
    }

    if (this.options.branch) {
      await RepositoryValidator.validateBranchExists(
        this.getResolvedPath(),
        this.options.branch,
        this.context.operation
      );
    }
  }
}

/**
 * Handles Git pull operations
 */
export class PullOperation extends BaseGitOperation<PullOptions, PullResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.pull();

    if (this.options.remote) {
      command.arg(this.options.remote);
    }

    if (this.options.branch) {
      command.arg(this.options.branch);
    }

    if (this.options.rebase) {
      command.flag('rebase');
    }

    if (this.options.autoStash) {
      command.flag('autostash');
    }

    if (this.options.allowUnrelated) {
      command.flag('allow-unrelated-histories');
    }

    if (this.options.ff === 'only') {
      command.flag('ff-only');
    } else if (this.options.ff === 'no') {
      command.flag('no-ff');
    }

    if (this.options.strategy) {
      command.option('strategy', this.options.strategy);
    }

    if (this.options.strategyOption) {
      this.options.strategyOption.forEach(opt => {
        command.option('strategy-option', opt);
      });
    }

    return command;
  }

  protected parseResult(result: CommandResult): PullResult {
    const summary = {
      merged: [] as string[],
      conflicts: [] as string[]
    };

    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    // Parse pull output
    result.stdout.split('\n').forEach(line => {
      if (line.includes('|')) {
        // Parse merge stats
        const statsMatch = line.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
        if (statsMatch) {
          filesChanged = parseInt(statsMatch[1], 10);
          insertions = statsMatch[2] ? parseInt(statsMatch[2], 10) : 0;
          deletions = statsMatch[3] ? parseInt(statsMatch[3], 10) : 0;
        }
      } else if (line.includes('Fast-forward') || line.includes('Merge made by')) {
        // Track merged files
        const mergeMatch = line.match(/([^/]+)$/);
        if (mergeMatch) {
          summary.merged.push(mergeMatch[1]);
        }
      } else if (line.includes('CONFLICT')) {
        // Track conflicts
        const conflictMatch = line.match(/CONFLICT \(.+?\): (.+)/);
        if (conflictMatch) {
          summary.conflicts.push(conflictMatch[1]);
        }
      }
    });

    return {
      remote: this.options.remote || 'origin',
      branch: this.options.branch,
      rebased: this.options.rebase || false,
      filesChanged,
      insertions,
      deletions,
      summary: {
        merged: summary.merged.length > 0 ? summary.merged : undefined,
        conflicts: summary.conflicts.length > 0 ? summary.conflicts : undefined
      },
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'pull',
      stateType: RepoStateType.REMOTE
    };
  }

  protected async validateOptions(): Promise<void> {
    if (!this.options.branch) {
      throw ErrorHandler.handleValidationError(
        new Error('Branch must be specified'),
        { operation: this.context.operation }
      );
    }

    if (this.options.remote) {
      await RepositoryValidator.validateRemoteConfig(
        this.getResolvedPath(),
        this.options.remote,
        this.context.operation
      );
    }

    // Ensure working tree is clean unless autostash is enabled
    if (!this.options.autoStash) {
      await RepositoryValidator.ensureClean(
        this.getResolvedPath(),
        this.context.operation
      );
    }
  }
}

/**
 * Handles Git fetch operations
 */
export class FetchOperation extends BaseGitOperation<FetchOptions, FetchResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.fetch();

    if (this.options.remote && !this.options.all) {
      command.arg(this.options.remote);
    }

    if (this.options.all) {
      command.flag('all');
    }

    if (this.options.prune) {
      command.flag('prune');
    }

    if (this.options.pruneTags) {
      command.flag('prune-tags');
    }

    if (this.options.tags) {
      command.flag('tags');
    }

    if (this.options.tagsOnly) {
      command.flag('tags').flag('no-recurse-submodules');
    }

    if (this.options.forceTags) {
      command.flag('force').flag('tags');
    }

    if (this.options.depth) {
      command.option('depth', this.options.depth.toString());
    }

    if (typeof this.options.recurseSubmodules !== 'undefined') {
      if (typeof this.options.recurseSubmodules === 'boolean') {
        command.flag(this.options.recurseSubmodules ? 'recurse-submodules' : 'no-recurse-submodules');
      } else {
        command.option('recurse-submodules', this.options.recurseSubmodules);
      }
    }

    if (this.options.progress) {
      command.flag('progress');
    }

    return command;
  }

  protected parseResult(result: CommandResult): FetchResult {
    const summary = {
      branches: [] as Array<{ name: string; oldRef?: string; newRef: string }>,
      tags: [] as Array<{ name: string; oldRef?: string; newRef: string }>,
      pruned: [] as string[]
    };

    // Parse fetch output
    result.stdout.split('\n').forEach(line => {
      if (line.includes('->')) {
        // Parse branch/tag updates
        const match = line.match(/([a-f0-9]+)\.\.([a-f0-9]+)\s+(\S+)\s+->\s+(\S+)/);
        if (match) {
          const [, oldRef, newRef, localRef, remoteRef] = match;
          if (remoteRef.includes('refs/tags/')) {
            summary.tags.push({
              name: remoteRef.replace('refs/tags/', ''),
              oldRef,
              newRef
            });
          } else {
            summary.branches.push({
              name: remoteRef.replace('refs/remotes/', ''),
              oldRef,
              newRef
            });
          }
        }
      } else if (line.includes('[pruned]')) {
        // Parse pruned refs
        const pruneMatch = line.match(/\[pruned\] (.+)/);
        if (pruneMatch) {
          summary.pruned.push(pruneMatch[1]);
        }
      }
    });

    return {
      remote: this.options.remote,
      summary: {
        branches: summary.branches.length > 0 ? summary.branches : undefined,
        tags: summary.tags.length > 0 ? summary.tags : undefined,
        pruned: summary.pruned.length > 0 ? summary.pruned : undefined
      },
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'fetch',
      stateType: RepoStateType.REMOTE
    };
  }

  protected async validateOptions(): Promise<void> {
    if (this.options.remote && !this.options.all) {
      await RepositoryValidator.validateRemoteConfig(
        this.getResolvedPath(),
        this.options.remote,
        this.context.operation
      );
    }

    if (this.options.depth !== undefined && this.options.depth <= 0) {
      throw ErrorHandler.handleValidationError(
        new Error('Depth must be a positive number'),
        { operation: this.context.operation }
      );
    }
  }
}
