import { CommandExecutor } from './utils/command.js';
import { PathValidator } from './utils/path.js';
import { RepositoryValidator } from './utils/repository.js';
import { logger } from './utils/logger.js';
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

export class GitOperations {
  private static async executeOperation<T>(
    operation: string,
    path: string | undefined,
    action: () => Promise<T>
  ): Promise<T> {
    try {
      logger.info(operation, 'Starting git operation', path);
      const result = await action();
      logger.info(operation, 'Operation completed successfully', path);
      return result;
    } catch (error) {
      logger.error(operation, 'Operation failed', path, error as Error);
      throw error;
    }
  }

  private static getPath(options: BasePathOptions): string {
    if (!options.path && !process.env.GIT_DEFAULT_PATH) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Path must be provided when GIT_DEFAULT_PATH is not set'
      );
    }
    return options.path || process.env.GIT_DEFAULT_PATH!;
  }

  static async init(options: InitOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(context.operation, path, async () => {
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
    });
  }

  static async clone(options: CloneOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(context.operation, path, async () => {
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
    });
  }

  static async status(options: BasePathOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(context.operation, path, async () => {
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
    });
  }

  static async add({ path, files }: AddOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
      // Validate repository and check for embedded repos
      const { path: repoPath, hasEmbeddedRepo } = PathValidator.validateGitRepo(resolvedPath);
      
      // Validate paths with support for directories and patterns, using repo path as CWD
      const validatedPaths = PathValidator.validatePaths(files, {
        allowDirectory: true,
        allowPattern: true,
        mustExist: true,
        cwd: repoPath
      });

      // Handle embedded repositories if found
      if (hasEmbeddedRepo) {
        // Check each path for .git directories
        for (const p of validatedPaths) {
          if (existsSync(resolve(p, '.git'))) {
            // Remove the embedded .git directory
            await CommandExecutor.executeGitCommand(
              `rm -rf "${resolve(p, '.git')}"`,
              context.operation,
              repoPath
            );
            logger.info(context.operation, `Removed embedded .git directory from ${p}`);
          }
        }
      }

      // Add the files using relative paths
      const relativePaths = validatedPaths.map(p => {
        // If it's a pattern or starts with '.', use as-is
        if (p.includes('*') || p.startsWith('.')) {
          return p;
        }
        // Otherwise, make it relative to the repo root
        try {
          return `./${p.split(repoPath)[1].replace(/^[/\\]/, '')}`;
        } catch {
          return p;
        }
      });

      const result = await CommandExecutor.executeGitCommand(
        `add ${relativePaths.map(p => `"${p}"`).join(' ')}`,
        context.operation,
        repoPath
      );

      return {
        content: [{
          type: 'text',
          text: `Files staged successfully\n${CommandExecutor.formatOutput(result)}`
        }]
      };
    });
  }

  static async commit({ path, message }: CommitOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
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
    });
  }

  static async push({ path, remote = 'origin', branch }: PushPullOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
      await RepositoryValidator.validateRemoteConfig(repoPath, remote, context.operation);
      await RepositoryValidator.validateBranchExists(repoPath, branch, context.operation);
      
      const result = await CommandExecutor.executeGitCommand(
        `push ${remote} ${branch}`,
        context.operation,
        repoPath
      );

      return {
        content: [{
          type: 'text',
          text: `Changes pushed successfully\n${CommandExecutor.formatOutput(result)}`
        }]
      };
    });
  }

  // New bulk action implementation
  static async executeBulkActions(options: BulkActionOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath(options);
    return await this.executeOperation(context.operation, resolvedPath, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
      const results: string[] = [];

      for (const action of options.actions) {
        try {
          switch (action.type) {
            case 'stage': {
              // If no files specified, stage all changes
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
        } catch (error) {
          // Log the error but continue with remaining actions
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.push(`Failed to execute ${action.type}: ${errorMessage}`);
          logger.error(context.operation, `Bulk action ${action.type} failed`, repoPath, error as Error);
        }
      }

      return {
        content: [{
          type: 'text',
          text: results.join('\n\n')
        }]
      };
    });
  }

  static async pull({ path, remote = 'origin', branch }: PushPullOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
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
    });
  }

  static async branchList(options: BasePathOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(context.operation, path, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(path);
      const result = await CommandExecutor.executeGitCommand(
        'branch -a',
        context.operation,
        repoPath
      );

      return {
        content: [{
          type: 'text',
          text: CommandExecutor.formatOutput(result)
        }]
      };
    });
  }

  static async branchCreate({ path, name }: BranchOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
      PathValidator.validateBranchName(name);
      
      const result = await CommandExecutor.executeGitCommand(
        `checkout -b ${name}`,
        context.operation,
        repoPath
      );

      return {
        content: [{
          type: 'text',
          text: `Branch '${name}' created successfully\n${CommandExecutor.formatOutput(result)}`
        }]
      };
    });
  }

  static async branchDelete({ path, name }: BranchOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
      PathValidator.validateBranchName(name);
      await RepositoryValidator.validateBranchExists(repoPath, name, context.operation);
      
      const currentBranch = await RepositoryValidator.getCurrentBranch(repoPath, context.operation);
      if (currentBranch === name) {
        throw new Error(`Cannot delete the currently checked out branch: ${name}`);
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
    });
  }

  static async checkout({ path, target }: CheckoutOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
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
    });
  }

  static async tagList(options: BasePathOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(context.operation, path, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(path);
      const result = await CommandExecutor.executeGitCommand(
        'tag -l',
        context.operation,
        repoPath
      );

      return {
        content: [{
          type: 'text',
          text: CommandExecutor.formatOutput(result)
        }]
      };
    });
  }

  static async tagCreate({ path, name, message }: TagOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
      PathValidator.validateTagName(name);
      
      // Build the command based on whether a message is provided
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
    });
  }

  static async tagDelete({ path, name }: TagOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
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
    });
  }

  static async remoteList(options: BasePathOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(context.operation, path, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(path);
      const result = await CommandExecutor.executeGitCommand(
        'remote -v',
        context.operation,
        repoPath
      );

      return {
        content: [{
          type: 'text',
          text: CommandExecutor.formatOutput(result)
        }]
      };
    });
  }

  static async remoteAdd({ path, name, url }: RemoteOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
      PathValidator.validateRemoteName(name);
      if (!url) {
        throw new Error('URL is required when adding a remote');
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
    });
  }

  static async remoteRemove({ path, name }: RemoteOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
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
    });
  }

  static async stashList(options: BasePathOptions, context: GitToolContext): Promise<GitToolResult> {
    const path = this.getPath(options);
    return await this.executeOperation(context.operation, path, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(path);
      const result = await CommandExecutor.executeGitCommand(
        'stash list',
        context.operation,
        repoPath
      );

      return {
        content: [{
          type: 'text',
          text: CommandExecutor.formatOutput(result)
        }]
      };
    });
  }

  static async stashSave({ path, message }: StashOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
      const { path: repoPath } = PathValidator.validateGitRepo(resolvedPath);
      const command = typeof message === 'string' && message.length > 0 
        ? `stash save "${message}"`
        : 'stash';
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
    });
  }

  static async stashPop({ path, index = 0 }: StashOptions, context: GitToolContext): Promise<GitToolResult> {
    const resolvedPath = this.getPath({ path });
    return await this.executeOperation(context.operation, resolvedPath, async () => {
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
    });
  }
}
