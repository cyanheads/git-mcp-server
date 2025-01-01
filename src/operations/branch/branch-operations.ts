import { BaseGitOperation } from '../base/base-operation.js';
import { GitCommandBuilder } from '../../common/command-builder.js';
import { CommandResult } from '../base/operation-result.js';
import { ErrorHandler } from '../../errors/error-handler.js';
import { RepositoryValidator } from '../../utils/repository.js';
import { RepoStateType } from '../../caching/repository-cache.js';
import {
  BranchListOptions,
  BranchCreateOptions,
  BranchDeleteOptions,
  CheckoutOptions,
  BranchListResult,
  BranchCreateResult,
  BranchDeleteResult,
  CheckoutResult,
  BranchInfo
} from './branch-types.js';

/**
 * Handles Git branch listing operations
 */
export class BranchListOperation extends BaseGitOperation<BranchListOptions, BranchListResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.branch();

    // Add format option for parsing
    command.option('format', '%(refname:short)|%(upstream:short)|%(objectname:short)|%(subject)');

    if (this.options.remotes) {
      command.flag('remotes');
    }
    if (this.options.all) {
      command.flag('all');
    }
    if (this.options.contains) {
      command.option('contains', this.options.contains);
    }
    if (this.options.merged) {
      command.option('merged', this.options.merged);
    }
    if (this.options.noMerged) {
      command.option('no-merged', this.options.noMerged);
    }

    return command;
  }

  protected parseResult(result: CommandResult): BranchListResult {
    const branches: BranchInfo[] = [];
    let current = '';

    // Parse each line of output
    result.stdout.split('\n').filter(Boolean).forEach(line => {
      const [name, tracking, commit, message] = line.split('|');
      const isCurrent = name.startsWith('* ');
      const cleanName = name.replace('* ', '');
      
      const branch: BranchInfo = {
        name: cleanName,
        current: isCurrent,
        tracking: tracking || undefined,
        remote: cleanName.includes('origin/'),
        commit: commit || undefined,
        message: message || undefined
      };

      if (isCurrent) {
        current = cleanName;
      }

      branches.push(branch);
    });

    return {
      current,
      branches,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'branch',
      stateType: RepoStateType.BRANCH
    };
  }

  protected validateOptions(): void {
    // No specific validation needed for listing
  }
}

/**
 * Handles Git branch creation operations
 */
export class BranchCreateOperation extends BaseGitOperation<BranchCreateOptions, BranchCreateResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.branch()
      .arg(this.options.name);

    if (this.options.startPoint) {
      command.arg(this.options.startPoint);
    }

    if (this.options.force) {
      command.withForce();
    }

    if (this.options.track) {
      command.withTrack();
    } else {
      command.withNoTrack();
    }

    if (this.options.setUpstream) {
      command.withSetUpstream();
    }

    return command;
  }

  protected parseResult(result: CommandResult): BranchCreateResult {
    return {
      name: this.options.name,
      startPoint: this.options.startPoint,
      tracking: result.stdout.includes('set up to track') ? 
        result.stdout.match(/track\s+([^\s]+)/)?.[1] : undefined,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'branch_create',
      stateType: RepoStateType.BRANCH
    };
  }

  protected validateOptions(): void {
    if (!this.options.name) {
      throw ErrorHandler.handleValidationError(
        new Error('Branch name is required'),
        { operation: this.context.operation }
      );
    }
  }
}

/**
 * Handles Git branch deletion operations
 */
export class BranchDeleteOperation extends BaseGitOperation<BranchDeleteOptions, BranchDeleteResult> {
  protected async buildCommand(): Promise<GitCommandBuilder> {
    const command = GitCommandBuilder.branch();

    // Use -D for force delete, -d for safe delete
    command.flag(this.options.force ? 'D' : 'd')
      .arg(this.options.name);

    if (this.options.remote) {
      // Get remote name from branch if it's a remote branch
      const remoteName = this.options.name.split('/')[0];
      if (remoteName) {
        await RepositoryValidator.validateRemoteConfig(
          this.getResolvedPath(),
          remoteName,
          this.context.operation
        );
      }
      command.flag('r');
    }

    return command;
  }

  protected parseResult(result: CommandResult): BranchDeleteResult {
    return {
      name: this.options.name,
      forced: this.options.force || false,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'branch_delete',
      stateType: RepoStateType.BRANCH
    };
  }

  protected async validateOptions(): Promise<void> {
    if (!this.options.name) {
      throw ErrorHandler.handleValidationError(
        new Error('Branch name is required'),
        { operation: this.context.operation }
      );
    }

    // Ensure branch exists
    await RepositoryValidator.validateBranchExists(
      this.getResolvedPath(),
      this.options.name,
      this.context.operation
    );

    // Cannot delete current branch
    const currentBranch = await RepositoryValidator.getCurrentBranch(
      this.getResolvedPath(),
      this.context.operation
    );
    if (currentBranch === this.options.name) {
      throw ErrorHandler.handleValidationError(
        new Error(`Cannot delete the currently checked out branch: ${this.options.name}`),
        { operation: this.context.operation }
      );
    }
  }

}

/**
 * Handles Git checkout operations
 */
export class CheckoutOperation extends BaseGitOperation<CheckoutOptions, CheckoutResult> {
  protected async buildCommand(): Promise<GitCommandBuilder> {
    const command = GitCommandBuilder.checkout();

    if (this.options.newBranch) {
      command.flag('b').arg(this.options.newBranch);
      if (this.options.track) {
        command.withTrack();
      }
    }

    command.arg(this.options.target);

    if (this.options.force) {
      command.withForce();
    }

    return command;
  }

  protected parseResult(result: CommandResult): CheckoutResult {
    const previousHead = result.stdout.match(/HEAD is now at ([a-f0-9]+)/)?.[1];
    const newBranch = result.stdout.includes('Switched to a new branch') ? 
      this.options.newBranch : undefined;

    return {
      target: this.options.target,
      newBranch,
      previousHead,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'checkout',
      stateType: RepoStateType.BRANCH
    };
  }

  protected async validateOptions(): Promise<void> {
    if (!this.options.target) {
      throw ErrorHandler.handleValidationError(
        new Error('Checkout target is required'),
        { operation: this.context.operation }
      );
    }

    // Ensure working tree is clean unless force is specified
    if (!this.options.force) {
      await RepositoryValidator.ensureClean(
        this.getResolvedPath(),
        this.context.operation
      );
    }
  }

}
