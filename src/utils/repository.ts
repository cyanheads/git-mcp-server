import { existsSync } from 'fs';
import { join } from 'path';
import { CommandExecutor } from './command.js';
import { ErrorHandler } from '../errors/error-handler.js';
import { GitMcpError } from '../errors/error-types.js';

export class RepositoryValidator {
  static async validateLocalRepo(path: string, operation: string): Promise<void> {
    try {
      const gitDir = join(path, '.git');
      if (!existsSync(gitDir)) {
        throw new Error('Not a git repository');
      }
    } catch (error: unknown) {
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { gitDir: join(path, '.git') }
      });
    }
  }

  static async validateRemoteRepo(remote: string, operation: string): Promise<void> {
    try {
      await CommandExecutor.execute(`git ls-remote ${remote}`, operation);
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        details: { 
          remote,
          action: 'validate_remote_repo'
        }
      });
    }
  }

  static async validateBranchExists(path: string, branch: string, operation: string): Promise<void> {
    try {
      await CommandExecutor.execute(
        `git show-ref --verify --quiet refs/heads/${branch}`,
        operation,
        path
      );
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { 
          branch,
          action: 'validate_branch_exists'
        }
      });
    }
  }

  static async validateRemoteBranchExists(path: string, remote: string, branch: string, operation: string): Promise<void> {
    try {
      await CommandExecutor.execute(
        `git show-ref --verify --quiet refs/remotes/${remote}/${branch}`,
        operation,
        path
      );
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { 
          remote,
          branch,
          action: 'validate_remote_branch_exists'
        }
      });
    }
  }

  static async getCurrentBranch(path: string, operation: string): Promise<string> {
    try {
      const result = await CommandExecutor.execute('git rev-parse --abbrev-ref HEAD', operation, path);
      return result.stdout.trim();
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { 
          action: 'get_current_branch',
          command: 'git rev-parse --abbrev-ref HEAD'
        }
      });
    }
  }

  static async ensureClean(path: string, operation: string): Promise<void> {
    let statusResult;
    try {
      statusResult = await CommandExecutor.execute('git status --porcelain', operation, path);
      if (statusResult.stdout.trim()) {
        throw new Error('Working directory is not clean. Please commit or stash your changes.');
      }
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { 
          action: 'ensure_clean',
          status: statusResult?.stdout || 'unknown'
        }
      });
    }
  }

  static async validateRemoteConfig(path: string, remote: string, operation: string): Promise<void> {
    let remoteResult;
    try {
      remoteResult = await CommandExecutor.execute(`git remote get-url ${remote}`, operation, path);
      if (!remoteResult.stdout.trim()) {
        throw new Error(`Remote ${remote} is not configured`);
      }
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { 
          remote,
          action: 'validate_remote_config',
          remoteUrl: remoteResult?.stdout || 'unknown'
        }
      });
    }
  }

  static async validateCommitExists(path: string, commit: string, operation: string): Promise<void> {
    try {
      await CommandExecutor.execute(`git cat-file -e ${commit}^{commit}`, operation, path);
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { 
          commit,
          action: 'validate_commit_exists'
        }
      });
    }
  }

  static async validateTagExists(path: string, tag: string, operation: string): Promise<void> {
    try {
      await CommandExecutor.execute(`git show-ref --tags --quiet refs/tags/${tag}`, operation, path);
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { 
          tag,
          action: 'validate_tag_exists'
        }
      });
    }
  }

  /**
   * Validates repository configuration
   */
  static async validateRepositoryConfig(path: string, operation: string): Promise<void> {
    let configResult;
    try {
      // Check core configuration
      configResult = await CommandExecutor.execute('git config --list', operation, path);
      const config = new Map<string, string>(
        configResult.stdout
          .split('\n')
          .filter(line => line)
          .map(line => {
            const [key, ...values] = line.split('=');
            return [key, values.join('=')] as [string, string];
          })
      );

      // Required configurations
      const requiredConfigs = [
        ['core.repositoryformatversion', '0'],
        ['core.filemode', 'true'],
        ['core.bare', 'false']
      ];

      for (const [key, value] of requiredConfigs) {
        if (config.get(key) !== value) {
          throw new Error(`Invalid repository configuration: ${key}=${config.get(key) || 'undefined'}`);
        }
      }

      // Check repository integrity
      await CommandExecutor.execute('git fsck --full', operation, path);

    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { 
          action: 'validate_repository_config',
          config: configResult?.stdout || 'unknown'
        }
      });
    }
  }

  /**
   * Checks if a repository has any uncommitted changes
   */
  static async hasUncommittedChanges(path: string, operation: string): Promise<boolean> {
    try {
      const result = await CommandExecutor.execute('git status --porcelain', operation, path);
      return result.stdout.trim().length > 0;
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { 
          action: 'check_uncommitted_changes'
        }
      });
    }
  }

  /**
   * Gets the repository's current state information
   */
  static async getRepositoryState(path: string, operation: string): Promise<{
    branch: string;
    isClean: boolean;
    hasStashed: boolean;
    remotes: string[];
    lastCommit: string;
  }> {
    try {
      const [branch, isClean, stashList, remoteList, lastCommit] = await Promise.all([
        this.getCurrentBranch(path, operation),
        this.hasUncommittedChanges(path, operation).then(changes => !changes),
        CommandExecutor.execute('git stash list', operation, path),
        CommandExecutor.execute('git remote', operation, path),
        CommandExecutor.execute('git log -1 --format=%H', operation, path)
      ]);

      return {
        branch,
        isClean,
        hasStashed: stashList.stdout.trim().length > 0,
        remotes: remoteList.stdout.trim().split('\n').filter(Boolean),
        lastCommit: lastCommit.stdout.trim()
      };
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { 
          action: 'get_repository_state'
        }
      });
    }
  }
}
