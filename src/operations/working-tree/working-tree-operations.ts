import { BaseGitOperation } from '../base/base-operation.js';
import { GitCommandBuilder } from '../../common/command-builder.js';
import { CommandResult } from '../base/operation-result.js';
import { ErrorHandler } from '../../errors/error-handler.js';
import { RepositoryValidator } from '../../utils/repository.js';
import { CommandExecutor } from '../../utils/command.js';
import { RepoStateType } from '../../caching/repository-cache.js';
import {
  AddOptions,
  CommitOptions,
  StatusOptions,
  AddResult,
  CommitResult,
  StatusResult,
  FileChange
} from './working-tree-types.js';

/**
 * Handles Git add operations
 */
export class AddOperation extends BaseGitOperation<AddOptions, AddResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.add();

    if (this.options.all) {
      command.flag('all');
    }

    if (this.options.update) {
      command.flag('update');
    }

    if (this.options.ignoreRemoval) {
      command.flag('no-all');
    }

    if (this.options.force) {
      command.withForce();
    }

    if (this.options.dryRun) {
      command.flag('dry-run');
    }

    // Add files
    this.options.files.forEach(file => command.arg(file));

    return command;
  }

  protected parseResult(result: CommandResult): AddResult {
    const staged: string[] = [];
    const notStaged: Array<{ path: string; reason: string }> = [];

    // Parse output to determine which files were staged
    result.stdout.split('\n').forEach(line => {
      const match = line.match(/^add '(.+)'$/);
      if (match) {
        staged.push(match[1]);
      } else if (line.includes('error:')) {
        const errorMatch = line.match(/error: (.+?) '(.+?)'/);
        if (errorMatch) {
          notStaged.push({
            path: errorMatch[2],
            reason: errorMatch[1]
          });
        }
      }
    });

    return {
      staged,
      notStaged: notStaged.length > 0 ? notStaged : undefined,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'add',
      stateType: RepoStateType.STATUS
    };
  }

  protected validateOptions(): void {
    if (!this.options.files || this.options.files.length === 0) {
      throw ErrorHandler.handleValidationError(
        new Error('At least one file must be specified'),
        { operation: this.context.operation }
      );
    }
  }
}

/**
 * Handles Git commit operations
 */
export class CommitOperation extends BaseGitOperation<CommitOptions, CommitResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.commit();

    command.withMessage(this.options.message);

    if (this.options.allowEmpty) {
      command.flag('allow-empty');
    }

    if (this.options.amend) {
      command.flag('amend');
    }

    if (this.options.noVerify) {
      command.withNoVerify();
    }

    if (this.options.author) {
      command.option('author', this.options.author);
    }

    // Add specific files if provided
    if (this.options.files) {
      this.options.files.forEach(file => command.arg(file));
    }

    return command;
  }

  protected parseResult(result: CommandResult): CommitResult {
    const hash = result.stdout.match(/\[.+?(\w+)\]/)?.[1] || '';
    const stats = result.stdout.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);

    return {
      hash,
      filesChanged: stats ? parseInt(stats[1], 10) : 0,
      insertions: stats && stats[2] ? parseInt(stats[2], 10) : 0,
      deletions: stats && stats[3] ? parseInt(stats[3], 10) : 0,
      amended: this.options.amend || false,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'commit',
      stateType: RepoStateType.STATUS
    };
  }

  protected async validateOptions(): Promise<void> {
    if (!this.options.message && !this.options.amend) {
      throw ErrorHandler.handleValidationError(
        new Error('Commit message is required unless amending'),
        { operation: this.context.operation }
      );
    }

    // Verify there are staged changes unless allowing empty commits
    if (!this.options.allowEmpty) {
      const statusResult = await CommandExecutor.executeGitCommand(
        'status --porcelain',
        this.context.operation,
        this.getResolvedPath()
      );
      
      if (!statusResult.stdout.trim()) {
        throw ErrorHandler.handleValidationError(
          new Error('No changes to commit'),
          { operation: this.context.operation }
        );
      }
    }
  }
}

/**
 * Handles Git status operations
 */
export class StatusOperation extends BaseGitOperation<StatusOptions, StatusResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.status();

    // Use porcelain format for consistent parsing
    command.flag('porcelain');
    command.flag('z'); // Use NUL character as separator

    if (this.options.showUntracked) {
      command.flag('untracked-files');
    }

    if (this.options.ignoreSubmodules) {
      command.option('ignore-submodules', 'all');
    }

    if (this.options.showIgnored) {
      command.flag('ignored');
    }

    if (this.options.showBranch) {
      command.flag('branch');
    }

    return command;
  }

  protected async parseResult(result: CommandResult): Promise<StatusResult> {
    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];
    const untracked: FileChange[] = [];
    const ignored: FileChange[] = [];

    // Get current branch
    const branchResult = await CommandExecutor.executeGitCommand(
      'rev-parse --abbrev-ref HEAD',
      this.context.operation,
      this.getResolvedPath()
    );
    const branch = branchResult.stdout.trim();

    // Parse status output
    const entries = result.stdout.split('\0').filter(Boolean);
    for (const entry of entries) {
      const [status, ...pathParts] = entry.split(' ');
      const path = pathParts.join(' ');

      const change: FileChange = {
        path,
        type: this.parseChangeType(status),
        staged: status[0] !== ' ' && status[0] !== '?',
        raw: status
      };

      // Handle renamed files
      if (change.type === 'renamed') {
        const [oldPath, newPath] = path.split(' -> ');
        change.path = newPath;
        change.originalPath = oldPath;
      }

      // Categorize the change
      if (status === '??') {
        untracked.push(change);
      } else if (status === '!!') {
        ignored.push(change);
      } else if (change.staged) {
        staged.push(change);
      } else {
        unstaged.push(change);
      }
    }

    return {
      branch,
      clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
      staged,
      unstaged,
      untracked,
      ignored: this.options.showIgnored ? ignored : undefined,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'status',
      stateType: RepoStateType.STATUS
    };
  }

  protected validateOptions(): void {
    // No specific validation needed for status
  }

  private parseChangeType(status: string): FileChange['type'] {
    const index = status[0];
    const worktree = status[1];

    if (status === '??') return 'untracked';
    if (status === '!!') return 'ignored';
    if (index === 'R' || worktree === 'R') return 'renamed';
    if (index === 'C' || worktree === 'C') return 'copied';
    if (index === 'A' || worktree === 'A') return 'added';
    if (index === 'D' || worktree === 'D') return 'deleted';
    return 'modified';
  }
}
