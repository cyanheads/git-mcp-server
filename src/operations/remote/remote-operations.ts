import { BaseGitOperation } from '../base/base-operation.js';
import { GitCommandBuilder } from '../../common/command-builder.js';
import { CommandResult } from '../base/operation-result.js';
import { ErrorHandler } from '../../errors/error-handler.js';
import { RepositoryValidator } from '../../utils/repository.js';
import { CommandExecutor } from '../../utils/command.js';
import { RepoStateType } from '../../caching/repository-cache.js';
import {
  RemoteListOptions,
  RemoteAddOptions,
  RemoteRemoveOptions,
  RemoteSetUrlOptions,
  RemotePruneOptions,
  RemoteListResult,
  RemoteAddResult,
  RemoteRemoveResult,
  RemoteSetUrlResult,
  RemotePruneResult,
  RemoteConfig
} from './remote-types.js';

/**
 * Handles Git remote listing operations
 */
export class RemoteListOperation extends BaseGitOperation<RemoteListOptions, RemoteListResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.remote();

    if (this.options.verbose) {
      command.flag('verbose');
    }

    return command;
  }

  protected async parseResult(result: CommandResult): Promise<RemoteListResult> {
    const remotes: RemoteConfig[] = [];
    const lines = result.stdout.split('\n').filter(Boolean);

    for (const line of lines) {
      const [name, url, purpose] = line.split(/\s+/);
      
      // Find or create remote config
      let remote = remotes.find(r => r.name === name);
      if (!remote) {
        remote = {
          name,
          fetchUrl: url
        };
        remotes.push(remote);
      }

      // Set URL based on purpose
      if (purpose === '(push)') {
        remote.pushUrl = url;
      }

      // Get additional configuration if verbose
      if (this.options.verbose) {
        const configResult = await CommandExecutor.executeGitCommand(
          `config --get-regexp ^remote\\.${name}\\.`,
          this.context.operation,
          this.getResolvedPath()
        );

        configResult.stdout.split('\n').filter(Boolean).forEach(configLine => {
          const [key, value] = configLine.split(' ');
          const configKey = key.split('.')[2];

          switch (configKey) {
            case 'tagopt':
              remote!.fetchTags = value === '--tags';
              break;
            case 'mirror':
              remote!.mirror = value as 'fetch' | 'push';
              break;
            case 'fetch':
              if (!remote!.branches) remote!.branches = [];
              const branch = value.match(/refs\/heads\/(.+):refs\/remotes\/.+/)?.[1];
              if (branch) remote!.branches.push(branch);
              break;
          }
        });
      }
    }

    return {
      remotes,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'remote',
      stateType: RepoStateType.REMOTE
    };
  }

  protected validateOptions(): void {
    // No specific validation needed for listing
  }
}

/**
 * Handles Git remote add operations
 */
export class RemoteAddOperation extends BaseGitOperation<RemoteAddOptions, RemoteAddResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.remote()
      .arg('add');

    if (this.options.fetch) {
      command.flag('fetch');
    }

    if (typeof this.options.tags === 'boolean') {
      command.flag(this.options.tags ? 'tags' : 'no-tags');
    }

    if (this.options.mirror) {
      command.option('mirror', this.options.mirror);
    }

    command.arg(this.options.name)
      .arg(this.options.url);

    return command;
  }

  protected async parseResult(result: CommandResult): Promise<RemoteAddResult> {
    // Get full remote configuration
    const listOperation = new RemoteListOperation(this.context, { verbose: true });
    const listResult = await listOperation.execute();
    const remotes = listResult.data?.remotes;
    if (!remotes) {
      throw ErrorHandler.handleOperationError(
        new Error('Failed to get remote list'),
        { operation: this.context.operation }
      );
    }
    const remote = remotes.find(r => r.name === this.options.name);

    if (!remote) {
      throw ErrorHandler.handleOperationError(
        new Error(`Failed to get configuration for remote ${this.options.name}`),
        { operation: this.context.operation }
      );
    }

    return {
      remote,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'remote_add',
      stateType: RepoStateType.REMOTE
    };
  }

  protected validateOptions(): void {
    if (!this.options.name) {
      throw ErrorHandler.handleValidationError(
        new Error('Remote name is required'),
        { operation: this.context.operation }
      );
    }

    if (!this.options.url) {
      throw ErrorHandler.handleValidationError(
        new Error('Remote URL is required'),
        { operation: this.context.operation }
      );
    }
  }
}

/**
 * Handles Git remote remove operations
 */
export class RemoteRemoveOperation extends BaseGitOperation<RemoteRemoveOptions, RemoteRemoveResult> {
  protected buildCommand(): GitCommandBuilder {
    return GitCommandBuilder.remote()
      .arg('remove')
      .arg(this.options.name);
  }

  protected parseResult(result: CommandResult): RemoteRemoveResult {
    return {
      name: this.options.name,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'remote_remove',
      stateType: RepoStateType.REMOTE
    };
  }

  protected async validateOptions(): Promise<void> {
    if (!this.options.name) {
      throw ErrorHandler.handleValidationError(
        new Error('Remote name is required'),
        { operation: this.context.operation }
      );
    }

    // Ensure remote exists
    await RepositoryValidator.validateRemoteConfig(
      this.getResolvedPath(),
      this.options.name,
      this.context.operation
    );
  }
}

/**
 * Handles Git remote set-url operations
 */
export class RemoteSetUrlOperation extends BaseGitOperation<RemoteSetUrlOptions, RemoteSetUrlResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.remote()
      .arg('set-url');

    if (this.options.pushUrl) {
      command.flag('push');
    }

    if (this.options.add) {
      command.flag('add');
    }

    if (this.options.delete) {
      command.flag('delete');
    }

    command.arg(this.options.name)
      .arg(this.options.url);

    return command;
  }

  protected async parseResult(result: CommandResult): Promise<RemoteSetUrlResult> {
    // Get full remote configuration
    const listOperation = new RemoteListOperation(this.context, { verbose: true });
    const listResult = await listOperation.execute();
    const remotes = listResult.data?.remotes;
    if (!remotes) {
      throw ErrorHandler.handleOperationError(
        new Error('Failed to get remote list'),
        { operation: this.context.operation }
      );
    }
    const remote = remotes.find(r => r.name === this.options.name);

    if (!remote) {
      throw ErrorHandler.handleOperationError(
        new Error(`Failed to get configuration for remote ${this.options.name}`),
        { operation: this.context.operation }
      );
    }

    return {
      remote,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'remote_set_url',
      stateType: RepoStateType.REMOTE
    };
  }

  protected async validateOptions(): Promise<void> {
    if (!this.options.name) {
      throw ErrorHandler.handleValidationError(
        new Error('Remote name is required'),
        { operation: this.context.operation }
      );
    }

    if (!this.options.url) {
      throw ErrorHandler.handleValidationError(
        new Error('Remote URL is required'),
        { operation: this.context.operation }
      );
    }

    // Ensure remote exists
    await RepositoryValidator.validateRemoteConfig(
      this.getResolvedPath(),
      this.options.name,
      this.context.operation
    );
  }
}

/**
 * Handles Git remote prune operations
 */
export class RemotePruneOperation extends BaseGitOperation<RemotePruneOptions, RemotePruneResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.remote()
      .arg('prune');

    if (this.options.dryRun) {
      command.flag('dry-run');
    }

    command.arg(this.options.name);

    return command;
  }

  protected parseResult(result: CommandResult): RemotePruneResult {
    const prunedBranches = result.stdout
      .split('\n')
      .filter(line => line.includes('* [pruned] '))
      .map(line => line.match(/\* \[pruned\] (.+)/)?.[1] || '');

    return {
      name: this.options.name,
      prunedBranches,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'remote_prune',
      stateType: RepoStateType.REMOTE
    };
  }

  protected async validateOptions(): Promise<void> {
    if (!this.options.name) {
      throw ErrorHandler.handleValidationError(
        new Error('Remote name is required'),
        { operation: this.context.operation }
      );
    }

    // Ensure remote exists
    await RepositoryValidator.validateRemoteConfig(
      this.getResolvedPath(),
      this.options.name,
      this.context.operation
    );
  }
}
