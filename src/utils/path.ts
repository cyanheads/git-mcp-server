import { resolve, isAbsolute, normalize, relative } from 'path';
import { existsSync, statSync, readdirSync } from 'fs';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class PathError extends McpError {
  constructor(message: string) {
    super(ErrorCode.InvalidParams, `Path Error: ${message}`);
  }
}

export interface PathValidationOptions {
  mustExist?: boolean;
  allowDirectory?: boolean;
  allowPattern?: boolean;
  cwd?: string;
}

export class PathValidator {
  static validatePath(path: string, options: PathValidationOptions = {}): string {
    const { mustExist = true, allowDirectory = true, cwd = process.cwd() } = options;

    if (!path || typeof path !== 'string') {
      throw new PathError('Path must be a non-empty string');
    }

    // Convert to absolute path if relative
    const absolutePath = isAbsolute(path) ? normalize(path) : resolve(cwd, path);

    // Check existence if required
    if (mustExist && !existsSync(absolutePath)) {
      throw new PathError(`Path does not exist: ${path}`);
    }

    // If path exists and is not a pattern, validate type
    if (existsSync(absolutePath)) {
      const stats = statSync(absolutePath);
      if (!allowDirectory && stats.isDirectory()) {
        throw new PathError(`Path is a directory when file expected: ${path}`);
      }
    }

    return absolutePath;
  }

  static validateGitRepo(path: string): { path: string; hasEmbeddedRepo: boolean } {
    const absolutePath = this.validatePath(path, { allowDirectory: true });
    const gitPath = resolve(absolutePath, '.git');

    if (!existsSync(gitPath)) {
      throw new PathError(`Not a git repository: ${path}`);
    }

    if (!statSync(gitPath).isDirectory()) {
      throw new PathError(`Invalid git repository: ${path}`);
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
  }

  static validatePaths(paths: string[], options: PathValidationOptions = {}): string[] {
    const { allowPattern = false, cwd = process.cwd() } = options;

    if (!Array.isArray(paths)) {
      throw new PathError('Paths must be an array');
    }

    return paths.map(path => {
      if (!path || typeof path !== 'string') {
        throw new PathError('Each path must be a non-empty string');
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
      const absolutePath = isAbsolute(path) ? normalize(path) : resolve(cwd, path);

      return absolutePath;
    });
  }

  static validateBranchName(branch: string): void {
    if (!branch || typeof branch !== 'string') {
      throw new PathError('Branch name must be a non-empty string');
    }

    // Git branch naming rules
    if (!/^(?!\/|\.|\.\.|@|\{|\}|\[|\]|\\)[\x21-\x7E]+(?<!\.lock|[/.])$/.test(branch)) {
      throw new PathError('Invalid branch name format');
    }
  }

  static validateRemoteName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new PathError('Remote name must be a non-empty string');
    }

    // Git remote naming rules
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name)) {
      throw new PathError('Invalid remote name format');
    }
  }

  static validateRemoteUrl(url: string): void {
    if (!url || typeof url !== 'string') {
      throw new PathError('Remote URL must be a non-empty string');
    }

    // Basic URL format validation for git URLs
    const gitUrlPattern = /^(git|https?|ssh):\/\/|^git@|^[a-zA-Z0-9_-]+:/;
    if (!gitUrlPattern.test(url)) {
      throw new PathError('Invalid git remote URL format');
    }
  }

  static validateTagName(tag: string): void {
    if (!tag || typeof tag !== 'string') {
      throw new PathError('Tag name must be a non-empty string');
    }

    // Git tag naming rules
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(tag)) {
      throw new PathError('Invalid tag name format');
    }
  }
}
