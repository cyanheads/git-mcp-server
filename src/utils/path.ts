import { resolve, isAbsolute, normalize } from 'path';
import { existsSync, statSync, readdirSync } from 'fs';
import { ErrorHandler } from '../errors/error-handler.js';
import { GitMcpError } from '../errors/error-types.js';

export interface PathValidationOptions {
  mustExist?: boolean;
  allowDirectory?: boolean;
  allowPattern?: boolean;
  cwd?: string;
  operation?: string;
}

export class PathValidator {
  static validatePath(path: string, options: PathValidationOptions = {}): string {
    const { 
      mustExist = true, 
      allowDirectory = true, 
      cwd = process.cwd(),
      operation = 'path_validation'
    } = options;

    try {
      if (!path || typeof path !== 'string') {
        throw new Error('Path must be a non-empty string');
      }

      // Convert to absolute path if relative
      const absolutePath = isAbsolute(path) ? normalize(path) : resolve(cwd, path);

      // Check existence if required
      if (mustExist && !existsSync(absolutePath)) {
        throw new Error(`Path does not exist: ${path}`);
      }

      // If path exists and is not a pattern, validate type
      if (existsSync(absolutePath)) {
        const stats = statSync(absolutePath);
        if (!allowDirectory && stats.isDirectory()) {
          throw new Error(`Path is a directory when file expected: ${path}`);
        }
      }

      return absolutePath;
    } catch (error: unknown) {
      throw ErrorHandler.handleValidationError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { options }
      });
    }
  }

  static validateGitRepo(path: string, operation = 'validate_repo'): { path: string; hasEmbeddedRepo: boolean } {
    try {
      const absolutePath = this.validatePath(path, { allowDirectory: true, operation });
      const gitPath = resolve(absolutePath, '.git');

      if (!existsSync(gitPath)) {
        throw new Error(`Not a git repository: ${path}`);
      }

      if (!statSync(gitPath).isDirectory()) {
        throw new Error(`Invalid git repository: ${path}`);
      }

      // Check for embedded repositories
      let hasEmbeddedRepo = false;
      const checkEmbeddedRepos = (dir: string) => {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = resolve(dir, entry.name);
            if (entry.name === '.git' && fullPath !== gitPath) {
              hasEmbeddedRepo = true;
              break;
            }
            if (entry.name !== '.git' && entry.name !== 'node_modules') {
              checkEmbeddedRepos(fullPath);
            }
          }
        }
      };
      checkEmbeddedRepos(absolutePath);

      return { path: absolutePath, hasEmbeddedRepo };
    } catch (error: unknown) {
      if (error instanceof GitMcpError) throw error;
      throw ErrorHandler.handleRepositoryError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        path,
        details: { gitPath: resolve(path, '.git') }
      });
    }
  }

  static validatePaths(paths: string[], options: PathValidationOptions = {}): string[] {
    const { 
      allowPattern = false, 
      cwd = process.cwd(),
      operation = 'validate_paths'
    } = options;

    try {
      if (!Array.isArray(paths)) {
        throw new Error('Paths must be an array');
      }

      return paths.map(path => {
        if (!path || typeof path !== 'string') {
          throw new Error('Each path must be a non-empty string');
        }

        // If patterns are allowed and path contains wildcards, return as-is
        if (allowPattern && /[*?[\]]/.test(path)) {
          return path;
        }

        // For relative paths starting with '.', make them relative to the repository root
        if (path.startsWith('.')) {
          // Just return the path as-is to let Git handle it relative to the repo root
          return path;
        }

        // Convert to absolute path if relative
        return isAbsolute(path) ? normalize(path) : resolve(cwd, path);
      });
    } catch (error: unknown) {
      throw ErrorHandler.handleValidationError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        details: { paths, options }
      });
    }
  }

  static validateBranchName(branch: string, operation = 'validate_branch'): void {
    try {
      if (!branch || typeof branch !== 'string') {
        throw new Error('Branch name must be a non-empty string');
      }

      // Git branch naming rules
      if (!/^(?!\/|\.|\.\.|@|\{|\}|\[|\]|\\)[\x21-\x7E]+(?<!\.lock|[/.])$/.test(branch)) {
        throw new Error('Invalid branch name format');
      }
    } catch (error: unknown) {
      throw ErrorHandler.handleValidationError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        details: { branch }
      });
    }
  }

  static validateRemoteName(name: string, operation = 'validate_remote'): void {
    try {
      if (!name || typeof name !== 'string') {
        throw new Error('Remote name must be a non-empty string');
      }

      // Git remote naming rules
      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name)) {
        throw new Error('Invalid remote name format');
      }
    } catch (error: unknown) {
      throw ErrorHandler.handleValidationError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        details: { remoteName: name }
      });
    }
  }

  static validateRemoteUrl(url: string, operation = 'validate_remote_url'): void {
    try {
      if (!url || typeof url !== 'string') {
        throw new Error('Remote URL must be a non-empty string');
      }

      // Basic URL format validation for git URLs
      const gitUrlPattern = /^(git|https?|ssh):\/\/|^git@|^[a-zA-Z0-9_-]+:/;
      if (!gitUrlPattern.test(url)) {
        throw new Error('Invalid git remote URL format');
      }

      // Additional security checks for URLs
      const securityPattern = /[<>'";&|]/;
      if (securityPattern.test(url)) {
        throw new Error('Remote URL contains invalid characters');
      }
    } catch (error: unknown) {
      throw ErrorHandler.handleValidationError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        details: { 
          url,
          allowedProtocols: ['git', 'https', 'ssh']
        }
      });
    }
  }

  static validateTagName(tag: string, operation = 'validate_tag'): void {
    try {
      if (!tag || typeof tag !== 'string') {
        throw new Error('Tag name must be a non-empty string');
      }

      // Git tag naming rules
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(tag)) {
        throw new Error('Invalid tag name format');
      }

      // Additional validation for semantic versioning tags
      if (tag.startsWith('v') && !/^v\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(tag)) {
        throw new Error('Invalid semantic version tag format');
      }
    } catch (error: unknown) {
      throw ErrorHandler.handleValidationError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        details: { 
          tag,
          semanticVersioning: tag.startsWith('v')
        }
      });
    }
  }

  /**
   * Validates a commit message format
   */
  static validateCommitMessage(message: string, operation = 'validate_commit'): void {
    try {
      if (!message || typeof message !== 'string') {
        throw new Error('Commit message must be a non-empty string');
      }

      // Basic commit message format validation
      if (message.length > 72) {
        throw new Error('Commit message exceeds maximum length of 72 characters');
      }

      // Check for conventional commit format if it appears to be one
      const conventionalPattern = /^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\(.+\))?: .+/;
      if (message.match(/^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)/) && !conventionalPattern.test(message)) {
        throw new Error('Invalid conventional commit format');
      }
    } catch (error: unknown) {
      throw ErrorHandler.handleValidationError(error instanceof Error ? error : new Error('Unknown error'), {
        operation,
        details: { 
          message,
          isConventionalCommit: message.match(/^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)/) !== null
        }
      });
    }
  }
}
