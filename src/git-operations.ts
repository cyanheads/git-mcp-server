import { CommandExecutor } from './utils/command.js';
import { PathValidator } from './utils/path.js';
import { RepositoryValidator } from './utils/repository.js';
import { logger } from './utils/logger.js';
import { repositoryCache } from './caching/repository-cache.js';
import { RepoStateType } from './caching/repository-cache.js';
import {
  GitToolResult,
  GitToolContext,
  InitOptions,
  CloneOptions,
  AddOptions,
  CommitOptions,
  PushPullOptions,
  BranchOptions,
  CheckoutOptions,
  TagOptions,
  RemoteOptions,
  StashOptions,
  BasePathOptions,
  BulkActionOptions,
  BulkAction,
} from './types.js';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ErrorHandler } from './errors/error-handler.js';
import { GitMcpError } from './errors/error-types.js';

export class GitOperations {
  private static async executeOperation<T>(
    operation: string,
    path: string | undefined,
    action: () => Promise<T>,
    options: {
      useCache?: boolean;
      stateType?: RepoStateType;
      command?: string;
      invalidateCache?: boolean;
    } = {}
  ): Promise<T> {
    try {
      logger.info(operation, 'Starting git operation', path);

      let result: T;
      if (options.useCache && path && options.stateType && options.command) {
        // Use cache for repository state operations
        result = await repositoryCache.getState(
          path,
          options.stateType,
          options.command,
          action
        );
      } else if (options.useCache && path && options.command) {
        // Use cache for command results
        result = await repositoryCache.getCommandResult(
          path,
          options.command,
          action
        );
      } else {
        // Execute without caching
        result = await action();
      }

      // Invalidate cache if needed
      if (options.invalidateCache && path) {
        if (options.stateType) {
          repositoryCache.invalidateState(path, options.stateType);
        }
        if (options.command) {
          repositoryCache.invalidateCommand(path, options.command);
        }
      }

      logger.info(operation, 'Operation completed successfully', path);
      return result;
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleOperationError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        command: options.command || 'git operation'
      });
    }
  }

  private static getPath(options: BasePathOptions): string {
    if (!options.path && !process.env.GIT_DEFAULT_PATH) {
      throw ErrorHandler.handleValidationError(
        new Error('Path must be provided when GIT_DEFAULT_PATH is not set'),
        { operation: 'get_path' }
      );
    }
    return options.path || process.env.GIT_DEFAULT_PATH!;
  }

  static async init(options: InitOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(
      context.operation,
      path,
      async () => {
        const pathInfo = PathValidator.validatePath(path, { mustExist: false, allowDirectory: true });
        const result = await CommandExecutor.executeGitCommand(
          'init',
          context.operation,
          pathInfo
        );

        return {
          content: [{
            type: 'text',
            text: `Repository initialized successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'init',
        invalidateCache: true // Invalidate all caches for this repo
      }
    );
  }

  static async clone(options: CloneOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(
      context.operation,
      path,
      async () => {
        const pathInfo = PathValidator.validatePath(path, { mustExist: false, allowDirectory: true });
        const result = await CommandExecutor.executeGitCommand(
          `clone ${options.url} ${pathInfo}`,
          context.operation
        );

        return {
          content: [{
            type: 'text',
            text: `Repository cloned successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'clone',
        invalidateCache: true // Invalidate all caches for this repo
      }
    );
  }

  static async status(options: BasePathOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(
      context.operation,
      path,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(path);
        const result = await CommandExecutor.executeGitCommand(
          'status',
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: CommandExecutor.formatOutput(result)
          }]
        };
      },
      {
        useCache: true,
        stateType: RepoStateType.STATUS,
        command: 'status'
      }
    );
  }

  static async add({ path, files }: AddOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        
        // Handle each file individually to avoid path issues
        for (const file of files) {
          await CommandExecutor.executeGitCommand(
            `add "${file}"`,
            context.operation,
            repoPath
          );
        }

        return {
          content: [{
            type: 'text',
            text: 'Files staged successfully'
          }]
        };
      },
      {
        command: 'add',
        invalidateCache: true, // Invalidate status cache
        stateType: RepoStateType.STATUS
      }
    );
  }

  static async commit({ path, message }: CommitOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        
        // Verify there are staged changes
        const statusResult = await CommandExecutor.executeGitCommand(
          'status --porcelain',
          context.operation,
          repoPath
        );
        
        if (!statusResult.stdout.trim()) {
          return {
            content: [{
              type: 'text',
              text: 'No changes to commit'
            }],
            isError: true
          };
        }

        const result = await CommandExecutor.executeGitCommand(
          `commit -m "${message}"`,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Changes committed successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'commit',
        invalidateCache: true, // Invalidate status and branch caches
        stateType: RepoStateType.STATUS
      }
    );
  }

  static async push({ path, remote = 'origin', branch, force, noVerify, tags }: PushPullOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        await RepositoryValidator.validateRemoteConfig(repoPath, remote, context.operation);
        await RepositoryValidator.validateBranchExists(repoPath, branch, context.operation);
        
        const result = await CommandExecutor.executeGitCommand(
          `push ${remote} ${branch}${force ? ' --force' : ''}${noVerify ? ' --no-verify' : ''}${tags ? ' --tags' : ''}`,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Changes pushed successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'push',
        invalidateCache: true, // Invalidate remote cache
        stateType: RepoStateType.REMOTE
      }
    );
  }

  static async executeBulkActions(options: BulkActionOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath(options);
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        const results: string[] = [];

        for (const action of options.actions) {
          try {
            switch (action.type) {
              case 'stage': {
                const files = action.files || ['.'];
                const addResult = await this.add({ path: repoPath, files }, context);
                results.push(addResult.content[0].text);
                break;
              }
              case 'commit': {
                const commitResult = await this.commit({ path: repoPath, message: action.message }, context);
                results.push(commitResult.content[0].text);
                break;
              }
              case 'push': {
                const pushResult = await this.push({ 
                  path: repoPath, 
                  remote: action.remote, 
                  branch: action.branch 
                }, context);
                results.push(pushResult.content[0].text);
                break;
              }
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.push(`Failed to execute ${action.type}: ${errorMessage}`);
            if (error instanceof Error) {
              logger.error(context.operation, `Bulk action ${action.type} failed`, repoPath, error);
            }
          }
        }

        return {
          content: [{
            type: 'text',
            text: results.join('\n\n')
          }]
        };
      },
      {
        command: 'bulk_action',
        invalidateCache: true // Invalidate all caches
      }
    );
  }

  static async pull({ path, remote = 'origin', branch }: PushPullOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        await RepositoryValidator.validateRemoteConfig(repoPath, remote, context.operation);
        
        const result = await CommandExecutor.executeGitCommand(
          `pull ${remote} ${branch}`,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Changes pulled successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'pull',
        invalidateCache: true // Invalidate all caches
      }
    );
  }

  static async branchList(options: BasePathOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(
      context.operation,
      path,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(path);
        const result = await CommandExecutor.executeGitCommand(
          'branch -a',
          context.operation,
          repoPath
        );

        const output = result.stdout.trim();
        return {
          content: [{
            type: 'text',
            text: output || 'No branches found'
          }]
        };
      },
      {
        useCache: true,
        stateType: RepoStateType.BRANCH,
        command: 'branch -a'
      }
    );
  }

  static async branchCreate({ path, name, force, track, setUpstream }: BranchOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        PathValidator.validateBranchName(name);
        
        const result = await CommandExecutor.executeGitCommand(
          `checkout -b ${name}${force ? ' --force' : ''}${track ? ' --track' : ' --no-track'}${setUpstream ? ' --set-upstream' : ''}`,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Branch '${name}' created successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'branch_create',
        invalidateCache: true, // Invalidate branch cache
        stateType: RepoStateType.BRANCH
      }
    );
  }

  static async branchDelete({ path, name }: BranchOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        PathValidator.validateBranchName(name);
        await RepositoryValidator.validateBranchExists(repoPath, name, context.operation);
        
        const currentBranch = await RepositoryValidator.getCurrentBranch(repoPath, context.operation);
        if (currentBranch === name) {
          throw ErrorHandler.handleValidationError(
            new Error(`Cannot delete the currently checked out branch: ${name}`),
            { operation: context.operation, path: repoPath }
          );
        }
        
        const result = await CommandExecutor.executeGitCommand(
          `branch -D ${name}`,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Branch '${name}' deleted successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'branch_delete',
        invalidateCache: true, // Invalidate branch cache
        stateType: RepoStateType.BRANCH
      }
    );
  }

  static async checkout({ path, target }: CheckoutOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        await RepositoryValidator.ensureClean(repoPath, context.operation);
        
        const result = await CommandExecutor.executeGitCommand(
          `checkout ${target}`,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Switched to '${target}' successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'checkout',
        invalidateCache: true, // Invalidate branch and status caches
        stateType: RepoStateType.BRANCH
      }
    );
  }

  static async tagList(options: BasePathOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(
      context.operation,
      path,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(path);
        const result = await CommandExecutor.executeGitCommand(
          'tag -l',
          context.operation,
          repoPath
        );

        const output = result.stdout.trim();
        return {
          content: [{
            type: 'text',
            text: output || 'No tags found'
          }]
        };
      },
      {
        useCache: true,
        stateType: RepoStateType.TAG,
        command: 'tag -l'
      }
    );
  }

  static async tagCreate({ path, name, message }: TagOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        PathValidator.validateTagName(name);
        
        let command = `tag ${name}`;
        if (typeof message === 'string' && message.length > 0) {
          command = `tag -a ${name} -m "${message}"`;
        }

        const result = await CommandExecutor.executeGitCommand(
          command,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Tag '${name}' created successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'tag_create',
        invalidateCache: true, // Invalidate tag cache
        stateType: RepoStateType.TAG
      }
    );
  }

  static async tagDelete({ path, name }: TagOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        PathValidator.validateTagName(name);
        await RepositoryValidator.validateTagExists(repoPath, name, context.operation);
        
        const result = await CommandExecutor.executeGitCommand(
          `tag -d ${name}`,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Tag '${name}' deleted successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'tag_delete',
        invalidateCache: true, // Invalidate tag cache
        stateType: RepoStateType.TAG
      }
    );
  }

  static async remoteList(options: BasePathOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(
      context.operation,
      path,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(path);
        const result = await CommandExecutor.executeGitCommand(
          'remote -v',
          context.operation,
          repoPath
        );

        const output = result.stdout.trim();
        return {
          content: [{
            type: 'text',
            text: output || 'No remotes configured'
          }]
        };
      },
      {
        useCache: true,
        stateType: RepoStateType.REMOTE,
        command: 'remote -v'
      }
    );
  }

  static async remoteAdd({ path, name, url }: RemoteOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        PathValidator.validateRemoteName(name);
        if (!url) {
          throw ErrorHandler.handleValidationError(
            new Error('URL is required when adding a remote'),
            { operation: context.operation, path: repoPath }
          );
        }
        PathValidator.validateRemoteUrl(url);
        
        const result = await CommandExecutor.executeGitCommand(
          `remote add ${name} ${url}`,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Remote '${name}' added successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'remote_add',
        invalidateCache: true, // Invalidate remote cache
        stateType: RepoStateType.REMOTE
      }
    );
  }

  static async remoteRemove({ path, name }: RemoteOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        PathValidator.validateRemoteName(name);
        
        const result = await CommandExecutor.executeGitCommand(
          `remote remove ${name}`,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Remote '${name}' removed successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'remote_remove',
        invalidateCache: true, // Invalidate remote cache
        stateType: RepoStateType.REMOTE
      }
    );
  }

  static async stashList(options: BasePathOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(
      context.operation,
      path,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(path);
        const result = await CommandExecutor.executeGitCommand(
          'stash list',
          context.operation,
          repoPath
        );

        const output = result.stdout.trim();
        return {
          content: [{
            type: 'text',
            text: output || 'No stashes found'
          }]
        };
      },
      {
        useCache: true,
        stateType: RepoStateType.STASH,
        command: 'stash list'
      }
    );
  }

  static async stashSave({ path, message, includeUntracked, keepIndex, all }: StashOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        let command = 'stash';
        if (typeof message === 'string' && message.length > 0) {
          command += ` save "${message}"`;
        }
        if (includeUntracked) {
          command += ' --include-untracked';
        }
        if (keepIndex) {
          command += ' --keep-index';
        }
        if (all) {
          command += ' --all';
        }
        const result = await CommandExecutor.executeGitCommand(
          command,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Changes stashed successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'stash_save',
        invalidateCache: true, // Invalidate stash and status caches
        stateType: RepoStateType.STASH
      }
    );
  }

  static async stashPop({ path, index = 0 }: StashOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(
      context.operation,
      resolvedPath,
      async () => {
        const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
        const result = await CommandExecutor.executeGitCommand(
          `stash pop stash@{${index}}`,
          context.operation,
          repoPath
        );

        return {
          content: [{
            type: 'text',
            text: `Stash applied successfully\n${CommandExecutor.formatOutput(result)}`
          }]
        };
      },
      {
        command: 'stash_pop',
        invalidateCache: true, // Invalidate stash and status caches
        stateType: RepoStateType.STASH
      }
    );
  }
}
