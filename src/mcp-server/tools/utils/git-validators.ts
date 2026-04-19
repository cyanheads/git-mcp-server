/**
 * @fileoverview Git safety validators and pre-flight checks for tool layer
 * @module mcp-server/tools/utils/git-validators
 *
 * This module contains PURE validators for the tool layer that do NOT execute git commands.
 * For git command execution validators, see src/services/git/providers/cli/utils/git-validators.ts
 */

import path from 'node:path';

import type { StorageService } from '@/storage/core/StorageService.js';
import { JsonRpcErrorCode, McpError } from '@/types-global/errors.js';
import { logger, type RequestContext, sanitization } from '@/utils/index.js';

/**
 * Resolve working directory from session storage or direct path input.
 *
 * This utility handles the common pattern of accepting either:
 * - '.' to use the session working directory (stored per tenant)
 * - An absolute path to a specific git repository
 *
 * The working directory is stored in StorageService with the key pattern:
 * `session:workingDir:{tenantId}`
 *
 * Uses graceful degradation for tenantId: defaults to 'default-tenant' when
 * auth is disabled (development mode) or tenantId is not present.
 *
 * @param pathInput - Path from tool input (either '.' or absolute path)
 * @param appContext - Request context (includes tenantId for multi-tenant storage)
 * @param storage - StorageService instance (resolved from DI container)
 * @returns Promise resolving to sanitized absolute path
 * @throws {McpError} If path is '.' and no session directory is set
 *
 * @example
 * ```typescript
 * // In a tool logic function
 * const { container } = await import('tsyringe');
 * const { StorageService as StorageServiceToken } = await import('@/container/tokens.js');
 * const storage = container.resolve<StorageService>(StorageServiceToken);
 *
 * const workingDir = await resolveWorkingDirectory(
 *   input.path,
 *   appContext,
 *   storage
 * );
 * // Use workingDir for git operations
 * ```
 */
export async function resolveWorkingDirectory(
  pathInput: string,
  appContext: RequestContext,
  storage: StorageService,
): Promise<string> {
  let workingDir: string;

  if (pathInput === '.') {
    // Load from session storage
    // Use graceful degradation for tenantId (development vs production)
    const tenantId = appContext.tenantId || 'default-tenant';

    // Create a context with tenantId for storage operations
    const storageContext: RequestContext = {
      ...appContext,
      tenantId,
    };

    logger.debug('Resolving session working directory', {
      ...storageContext,
    });

    const sessionWorkingDir = await storage.get<string>(
      `session:workingDir:${tenantId}`,
      storageContext,
    );

    if (!sessionWorkingDir) {
      throw new McpError(
        JsonRpcErrorCode.ValidationError,
        "No session working directory set. Please specify a 'path' or use 'git_set_working_dir' first.",
      );
    }

    workingDir = sessionWorkingDir;
    logger.debug('Resolved session working directory', {
      ...storageContext,
      workingDir,
    });
  } else {
    // Use provided path directly
    workingDir = pathInput;
    logger.debug('Using provided path as working directory', {
      ...appContext,
      workingDir,
    });
  }

  // Sanitize path for security (prevent directory traversal)
  // If GIT_BASE_DIR is configured, restrict operations to that directory tree
  const { config } = await import('@/config/index.js');
  const sanitizeOptions: {
    allowAbsolute: boolean;
    rootDir?: string;
  } = {
    allowAbsolute: true,
  };

  // Only set rootDir if config exists and GIT_BASE_DIR is configured
  // (config may be undefined in test environments)
  if (config?.git?.baseDir) {
    sanitizeOptions.rootDir = config.git.baseDir;
  }

  const { sanitizedPath } = sanitization.sanitizePath(
    workingDir,
    sanitizeOptions,
  );

  /**
   * sanitizePath returns paths relative to rootDir when rootDir is set.
   * Git is spawned with this as its cwd, so a relative path would resolve
   * against the MCP process cwd — making behavior client-dependent (see
   * issue #43). Re-anchor to baseDir so spawn always gets an absolute path.
   */
  const resolvedPath =
    sanitizeOptions.rootDir && !path.isAbsolute(sanitizedPath)
      ? path.resolve(sanitizeOptions.rootDir, sanitizedPath)
      : sanitizedPath;

  logger.debug('Sanitized working directory path', {
    ...appContext,
    original: workingDir,
    sanitized: sanitizedPath,
    resolved: resolvedPath,
    baseDir: config?.git?.baseDir,
  });

  return resolvedPath;
}

/**
 * Protected branch configuration
 */
export interface BranchProtectionConfig {
  /** Branches that require confirmation for destructive operations */
  protectedBranches: string[];
  /** Whether to enforce protection (default: true) */
  enforce: boolean;
}

/**
 * Default branch protection configuration
 *
 * Protects common main/production branches from accidental destructive operations.
 */
const DEFAULT_PROTECTION: BranchProtectionConfig = {
  protectedBranches: ['main', 'master', 'production', 'prod', 'develop', 'dev'],
  enforce: true,
};

/**
 * Check if a branch is protected and requires special handling.
 *
 * Protected branches typically include main, master, production, etc.
 * Operations on these branches should require explicit confirmation.
 *
 * @param branchName - Branch name to check
 * @param config - Protection configuration (uses DEFAULT_PROTECTION if not provided)
 * @returns True if branch is protected
 *
 * @example
 * ```typescript
 * if (isProtectedBranch('main')) {
 *   // Require confirmation for destructive operations
 * }
 * ```
 */
export function isProtectedBranch(
  branchName: string,
  config: BranchProtectionConfig = DEFAULT_PROTECTION,
): boolean {
  return config.protectedBranches.includes(branchName.toLowerCase());
}

/**
 * Validate that a destructive operation on a protected branch has explicit confirmation.
 *
 * Prevents accidental destructive operations (force push, reset --hard, etc.)
 * on important branches like main/master/production without explicit confirmation.
 *
 * @param branchName - Branch name to check
 * @param operation - Operation being performed (e.g., 'force push', 'reset --hard')
 * @param confirmed - Whether user explicitly confirmed the operation
 * @param config - Protection configuration (uses DEFAULT_PROTECTION if not provided)
 * @throws {McpError} If operation on protected branch is not confirmed
 *
 * @example
 * ```typescript
 * validateProtectedBranchOperation('main', 'reset --hard', userConfirmed);
 * // Throws if userConfirmed is false
 * ```
 */
export function validateProtectedBranchOperation(
  branchName: string,
  operation: string,
  confirmed: boolean,
  config: BranchProtectionConfig = DEFAULT_PROTECTION,
): void {
  if (!config.enforce) {
    return;
  }

  if (isProtectedBranch(branchName, config) && !confirmed) {
    throw new McpError(
      JsonRpcErrorCode.ValidationError,
      `Cannot perform '${operation}' on protected branch '${branchName}' without explicit confirmation.`,
      {
        branch: branchName,
        operation,
        hint: 'Set the confirmation parameter to true to proceed.',
      },
    );
  }
}

/**
 * Validate file path for git operations.
 *
 * Ensures the file path is within the repository and uses safe path components.
 * Prevents directory traversal and other path-based attacks.
 *
 * @param filePath - File path to validate (relative to repo root)
 * @param repoPath - Repository root path
 * @throws {McpError} If file path is invalid or unsafe
 *
 * @example
 * ```typescript
 * validateFilePath('src/index.ts', '/path/to/repo'); // OK
 * validateFilePath('../../../etc/passwd', '/path/to/repo'); // Throws
 * ```
 */
export function validateFilePath(filePath: string, _repoPath: string): void {
  // Check for path traversal attempts
  if (filePath.includes('..')) {
    throw new McpError(
      JsonRpcErrorCode.ValidationError,
      'File path contains invalid directory traversal',
      { filePath },
    );
  }

  // Check for absolute paths (should be relative to repo root)
  if (filePath.startsWith('/')) {
    throw new McpError(
      JsonRpcErrorCode.ValidationError,
      'File path must be relative to repository root',
      { filePath },
    );
  }

  // Check for null bytes (security risk)
  if (filePath.includes('\x00')) {
    throw new McpError(
      JsonRpcErrorCode.ValidationError,
      'File path contains null bytes',
      { filePath },
    );
  }
}

/**
 * Validate commit message format.
 *
 * Ensures commit messages meet basic quality standards:
 * - Not empty
 * - Not just whitespace
 * - Reasonable length limits
 *
 * @param message - Commit message to validate
 * @param maxLength - Maximum message length (default: 10000 characters)
 * @throws {McpError} If commit message is invalid
 *
 * @example
 * ```typescript
 * validateCommitMessage('feat: add new feature'); // OK
 * validateCommitMessage(''); // Throws
 * validateCommitMessage('   '); // Throws
 * ```
 */
export function validateCommitMessage(
  message: string,
  maxLength = 10000,
): void {
  if (!message || message.trim().length === 0) {
    throw new McpError(
      JsonRpcErrorCode.ValidationError,
      'Commit message cannot be empty',
    );
  }

  if (message.length > maxLength) {
    throw new McpError(
      JsonRpcErrorCode.ValidationError,
      `Commit message exceeds maximum length of ${maxLength} characters`,
      { messageLength: message.length, maxLength },
    );
  }
}
