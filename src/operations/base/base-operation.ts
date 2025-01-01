import { CommandExecutor } from '../../utils/command.js';
import { PathValidator } from '../../utils/path.js';
import { logger } from '../../utils/logger.js';
import { repositoryCache } from '../../caching/repository-cache.js';
import { RepoStateType } from '../../caching/repository-cache.js';
import { GitToolContext, GitToolResult } from '../../types.js';
import { GitCommandBuilder } from '../../common/command-builder.js';
import { GitOperationOptions, GitOperationResult, CommandResult } from './operation-result.js';
import { ErrorHandler } from '../../errors/error-handler.js';
import { GitMcpError } from '../../errors/error-types.js';

/**
 * Base class for all Git operations providing common functionality
 */
export abstract class BaseGitOperation<TOptions extends GitOperationOptions, TResult = void> {
  protected constructor(
    protected readonly context: GitToolContext,
    protected readonly options: TOptions
  ) {}

  /**
   * Execute the Git operation with proper error handling and caching
   */
  public async execute(): Promise<GitOperationResult<TResult>> {
    try {
      // Validate options before proceeding
      this.validateOptions();

      // Get resolved path
      const path = this.getResolvedPath();

      // Execute operation with caching if enabled
      const result = await this.executeWithCache(path);

      // Format the result
      return await this.formatResult(result);
    } catch (error: unknown) {
      return this.handleError(error);
    }
  }

  /**
   * Build the Git command for this operation
   */
  protected abstract buildCommand(): GitCommandBuilder | Promise<GitCommandBuilder>;

  /**
   * Parse the command result into operation-specific format
   */
  protected abstract parseResult(result: CommandResult): TResult | Promise<TResult>;

  /**
   * Get cache configuration for this operation
   */
  protected abstract getCacheConfig(): {
    command: string;
    stateType?: RepoStateType;
  };

  /**
   * Validate operation-specific options
   */
  protected abstract validateOptions(): void;

  /**
   * Execute the Git command with caching if enabled
   */
  private async executeWithCache(path: string): Promise<CommandResult> {
    const { command, stateType } = this.getCacheConfig();
    const action = () => this.executeCommand(path);

    if (this.options.useCache && path) {
      if (stateType) {
        // Use state cache
        return await repositoryCache.getState(
          path,
          stateType,
          command,
          action
        );
      } else {
        // Use command cache
        return await repositoryCache.getCommandResult(
          path,
          command,
          action
        );
      }
    }

    // Execute without caching
    return await action();
  }

  /**
   * Execute the Git command
   */
  private async executeCommand(path: string): Promise<CommandResult> {
    const builder = await Promise.resolve(this.buildCommand());
    const command = builder.toString();
    return await CommandExecutor.executeGitCommand(
      command,
      this.context.operation,
      path
    );
  }

  /**
   * Format the operation result into standard GitToolResult
   */
  private async formatResult(result: CommandResult): Promise<GitOperationResult<TResult>> {
    return {
      success: true,
      data: await Promise.resolve(this.parseResult(result)),
      content: [{
        type: 'text',
        text: CommandExecutor.formatOutput(result)
      }]
    };
  }

  /**
   * Handle operation errors
   */
  private handleError(error: unknown): GitOperationResult<TResult> {
    if (error instanceof GitMcpError) {
      return {
        success: false,
        error,
        content: [{
          type: 'text',
          text: error.message
        }]
      };
    }

    const wrappedError = ErrorHandler.handleOperationError(
      error instanceof Error ? error : new Error('Unknown error'),
      {
        operation: this.context.operation,
        path: this.options.path,
        command: this.getCacheConfig().command
      }
    );

    return {
      success: false,
      error: wrappedError,
      content: [{
        type: 'text',
        text: wrappedError.message
      }]
    };
  }

  /**
   * Get resolved path with proper validation
   */
  protected getResolvedPath(): string {
    const path = this.options.path || process.env.GIT_DEFAULT_PATH;
    if (!path) {
      throw ErrorHandler.handleValidationError(
        new Error('Path must be provided when GIT_DEFAULT_PATH is not set'),
        { operation: this.context.operation }
      );
    }

    const { path: repoPath } = PathValidator.validateGitRepo(path);
    return repoPath;
  }

  /**
   * Invalidate cache if needed
   */
  protected invalidateCache(path: string): void {
    if (this.options.invalidateCache) {
      const { command, stateType } = this.getCacheConfig();
      if (stateType) {
        repositoryCache.invalidateState(path, stateType);
      }
      repositoryCache.invalidateCommand(path, command);
    }
  }
}
