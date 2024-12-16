import { existsSync } from 'fs';
import { join } from 'path';
import { CommandExecutor } from './command.js';
import { PathError } from './path.js';

export class RepositoryValidator {
  static async validateLocalRepo(path: string, operation: string): Promise<void> {
    const gitDir = join(path, '.git');
    if (!existsSync(gitDir)) {
      throw new PathError('Not a git repository');
    }
  }

  static async validateRemoteRepo(remote: string, operation: string): Promise<void> {
    try {
      await CommandExecutor.execute(`git ls-remote ${remote}`, operation);
    } catch (error) {
      throw new PathError(`Remote repository not accessible: ${remote}`);
    }
  }

  static async validateBranchExists(path: string, branch: string, operation: string): Promise<void> {
    try {
      await CommandExecutor.execute(
        `git show-ref --verify --quiet refs/heads/${branch}`,
        operation,
        path
      );
    } catch {
      throw new PathError(`Branch does not exist: ${branch}`);
    }
  }

  static async validateRemoteBranchExists(path: string, remote: string, branch: string, operation: string): Promise<void> {
    try {
      await CommandExecutor.execute(
        `git show-ref --verify --quiet refs/remotes/${remote}/${branch}`,
        operation,
        path
      );
    } catch {
      throw new PathError(`Remote branch ${remote}/${branch} does not exist`);
    }
  }

  static async getCurrentBranch(path: string, operation: string): Promise<string> {
    try {
      const result = await CommandExecutor.execute('git rev-parse --abbrev-ref HEAD', operation, path);
      return result.stdout.trim();
    } catch {
      throw new PathError('Failed to get current branch');
    }
  }

  static async ensureClean(path: string, operation: string): Promise<void> {
    try {
      const result = await CommandExecutor.execute('git status --porcelain', operation, path);
      if (result.stdout.trim()) {
        throw new PathError('Working directory is not clean');
      }
    } catch (error) {
      if (error instanceof PathError) throw error;
      throw new PathError('Failed to check repository status');
    }
  }

  static async validateRemoteConfig(path: string, remote: string, operation: string): Promise<void> {
    try {
      const result = await CommandExecutor.execute(`git remote get-url ${remote}`, operation, path);
      if (!result.stdout.trim()) {
        throw new PathError(`Remote ${remote} is not configured`);
      }
    } catch {
      throw new PathError(`Remote ${remote} is not configured`);
    }
  }

  static async validateCommitExists(path: string, commit: string, operation: string): Promise<void> {
    try {
      await CommandExecutor.execute(`git cat-file -e ${commit}^{commit}`, operation, path);
    } catch {
      throw new PathError(`Commit does not exist: ${commit}`);
    }
  }

  static async validateTagExists(path: string, tag: string, operation: string): Promise<void> {
    try {
      await CommandExecutor.execute(`git show-ref --tags --quiet refs/tags/${tag}`, operation, path);
    } catch {
      throw new PathError(`Tag does not exist: ${tag}`);
    }
  }
}
