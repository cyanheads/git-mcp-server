import { resolve, isAbsolute, normalize, relative, join, dirname } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';

export interface PathInfo {
  original: string;
  absolute: string;
  relative: string;
  exists: boolean;
  isDirectory?: boolean;
  isFile?: boolean;
  isGitRepo?: boolean;
  parent: string;
}

export class PathResolver {
  private static readonly CWD = process.cwd();

  private static createDirectory(path: string, operation: string): void {
    try {
      mkdirSync(path, { recursive: true });
      logger.info(operation, `Created directory: ${path}`);
    } catch (error) {
      logger.error(operation, `Failed to create directory: ${path}`, path, error as Error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create directory: ${(error as Error).message}`
      );
    }
  }

  private static getStats(path: string): { exists: boolean; isDirectory?: boolean; isFile?: boolean } {
    if (!existsSync(path)) {
      return { exists: false };
    }

    try {
      const stats = statSync(path);
      return {
        exists: true,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
      };
    } catch {
      return { exists: true };
    }
  }

  private static validateAbsolutePath(path: string, operation: string): void {
    if (!isAbsolute(path)) {
      const error = new McpError(
        ErrorCode.InvalidParams,
        `Path must be absolute. Received: ${path}\nExample: /Users/username/projects/my-repo`
      );
      logger.error(operation, 'Invalid path format', path, error);
      throw error;
    }
  }

  static getPathInfo(path: string, operation: string): PathInfo {
    logger.debug(operation, 'Resolving path info', path);

    // Validate absolute path
    this.validateAbsolutePath(path, operation);

    // Normalize the path
    const absolutePath = normalize(path);
    const relativePath = relative(this.CWD, absolutePath);
    const parentPath = dirname(absolutePath);

    // Get path stats
    const stats = this.getStats(absolutePath);
    const isGitRepo = stats.isDirectory ? existsSync(join(absolutePath, '.git')) : false;

    const pathInfo: PathInfo = {
      original: path,
      absolute: absolutePath,
      relative: relativePath,
      exists: stats.exists,
      isDirectory: stats.isDirectory,
      isFile: stats.isFile,
      isGitRepo,
      parent: parentPath,
    };

    logger.debug(operation, 'Path info resolved', path, pathInfo);
    return pathInfo;
  }

  static validatePath(path: string, operation: string, options: {
    mustExist?: boolean;
    mustBeDirectory?: boolean;
    mustBeFile?: boolean;
    mustBeGitRepo?: boolean;
    createIfMissing?: boolean;
  } = {}): PathInfo {
    const {
      mustExist = false,
      mustBeDirectory = false,
      mustBeFile = false,
      mustBeGitRepo = false,
      createIfMissing = false,
    } = options;

    logger.debug(operation, 'Validating path with options', path, options);

    // Get path info (includes absolute path validation)
    const pathInfo = this.getPathInfo(path, operation);

    // Create directory if needed
    if (!pathInfo.exists && (createIfMissing || mustBeDirectory)) {
      this.createDirectory(pathInfo.absolute, operation);
      return this.getPathInfo(path, operation);
    }

    // Handle existence requirements
    if (mustExist && !pathInfo.exists) {
      const error = new McpError(
        ErrorCode.InvalidParams,
        `Path does not exist: ${pathInfo.absolute}`
      );
      logger.error(operation, 'Path validation failed', path, error);
      throw error;
    }

    // Validate directory requirement
    if (mustBeDirectory && !pathInfo.isDirectory) {
      const error = new McpError(
        ErrorCode.InvalidParams,
        `Path is not a directory: ${pathInfo.absolute}`
      );
      logger.error(operation, 'Path validation failed', path, error);
      throw error;
    }

    // Validate file requirement
    if (mustBeFile && !pathInfo.isFile) {
      const error = new McpError(
        ErrorCode.InvalidParams,
        `Path is not a file: ${pathInfo.absolute}`
      );
      logger.error(operation, 'Path validation failed', path, error);
      throw error;
    }

    // Validate git repo requirement
    if (mustBeGitRepo && !pathInfo.isGitRepo) {
      const error = new McpError(
        ErrorCode.InvalidParams,
        `Path is not a git repository: ${pathInfo.absolute}`
      );
      logger.error(operation, 'Path validation failed', path, error);
      throw error;
    }

    logger.debug(operation, 'Path validation successful', path, pathInfo);
    return pathInfo;
  }

  static validateFilePaths(paths: string[], operation: string): PathInfo[] {
    logger.debug(operation, 'Validating multiple file paths', undefined, { paths });

    return paths.map(path => {
      // Validate absolute path
      this.validateAbsolutePath(path, operation);

      const pathInfo = this.validatePath(path, operation, {
        mustExist: true,
        mustBeFile: true,
      });
      return pathInfo;
    });
  }

  static validateGitRepo(path: string, operation: string): PathInfo {
    // Validate absolute path
    this.validateAbsolutePath(path, operation);

    return this.validatePath(path, operation, {
      mustExist: true,
      mustBeDirectory: true,
      mustBeGitRepo: true,
    });
  }

  static ensureDirectory(path: string, operation: string): PathInfo {
    // Validate absolute path
    this.validateAbsolutePath(path, operation);

    return this.validatePath(path, operation, {
      createIfMissing: true,
      mustBeDirectory: true,
    });
  }
}
