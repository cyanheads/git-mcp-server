import { BaseGitOperation } from '../base/base-operation.js';
import { GitOperationOptions, CommandResult } from '../base/operation-result.js';
import { GitCommandBuilder } from '../../common/command-builder.js';
import { ErrorHandler } from '../../errors/error-handler.js';
import { PathValidator } from '../../utils/path.js';

/**
 * Options for repository initialization
 */
export interface InitOptions extends GitOperationOptions {
  /** Whether to create a bare repository */
  bare?: boolean;
  /** Initial branch name */
  initialBranch?: string;
}

/**
 * Options for repository cloning
 */
export interface CloneOptions extends GitOperationOptions {
  /** Repository URL to clone from */
  url: string;
  /** Whether to create a bare repository */
  bare?: boolean;
  /** Depth of history to clone */
  depth?: number;
  /** Branch to clone */
  branch?: string;
}

/**
 * Handles Git repository initialization
 */
export class InitOperation extends BaseGitOperation<InitOptions> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.init();
    
    if (this.options.bare) {
      command.flag('bare');
    }
    
    if (this.options.initialBranch) {
      command.option('initial-branch', this.options.initialBranch);
    }
    
    return command;
  }

  protected parseResult(result: CommandResult): void {
    // Init doesn't return any structured data
  }

  protected getCacheConfig() {
    return {
      command: 'init'
    };
  }

  protected validateOptions(): void {
    const path = this.options.path || process.env.GIT_DEFAULT_PATH;
    if (!path) {
      throw ErrorHandler.handleValidationError(
        new Error('Path must be provided when GIT_DEFAULT_PATH is not set'),
        { operation: this.context.operation }
      );
    }

    // Validate path exists or can be created
    PathValidator.validatePath(path, {
      mustExist: false,
      allowDirectory: true
    });
  }
}

/**
 * Handles Git repository cloning
 */
export class CloneOperation extends BaseGitOperation<CloneOptions> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.clone()
      .arg(this.options.url)
      .arg(this.options.path || '.');
    
    if (this.options.bare) {
      command.flag('bare');
    }
    
    if (this.options.depth) {
      command.option('depth', this.options.depth.toString());
    }
    
    if (this.options.branch) {
      command.option('branch', this.options.branch);
    }
    
    return command;
  }

  protected parseResult(result: CommandResult): void {
    // Clone doesn't return any structured data
  }

  protected getCacheConfig() {
    return {
      command: 'clone'
    };
  }

  protected validateOptions(): void {
    if (!this.options.url) {
      throw ErrorHandler.handleValidationError(
        new Error('URL is required for clone operation'),
        { operation: this.context.operation }
      );
    }

    const path = this.options.path || process.env.GIT_DEFAULT_PATH;
    if (!path) {
      throw ErrorHandler.handleValidationError(
        new Error('Path must be provided when GIT_DEFAULT_PATH is not set'),
        { operation: this.context.operation }
      );
    }

    // Validate path exists or can be created
    PathValidator.validatePath(path, {
      mustExist: false,
      allowDirectory: true
    });

    if (this.options.depth !== undefined && this.options.depth <= 0) {
      throw ErrorHandler.handleValidationError(
        new Error('Depth must be a positive number'),
        { operation: this.context.operation }
      );
    }
  }
}
