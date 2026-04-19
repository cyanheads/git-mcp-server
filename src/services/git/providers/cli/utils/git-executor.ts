/**
 * @fileoverview Centralized Git CLI command executor with cross-runtime support
 * @module services/git/providers/cli/utils/git-executor
 *
 * This module provides the core execution engine for all git operations,
 * with support for both Bun and Node.js runtimes. When running via bunx
 * (Node.js), it uses child_process.spawn. When running in native Bun,
 * it uses Bun.spawn for better performance.
 *
 * Key features:
 * - Cross-runtime compatibility (Bun and Node.js)
 * - Configurable timeouts (60s default)
 * - Buffer size limits (10MB max)
 * - Automatic argument validation
 * - Standardized environment setup
 * - Comprehensive error mapping
 */

import { existsSync, statSync } from 'node:fs';

import { JsonRpcErrorCode, McpError } from '@/types-global/errors.js';

import { mapGitError } from './error-mapper.js';
import { buildGitEnv, validateGitArgs } from './command-builder.js';
import { spawnGitCommand } from './runtime-adapter.js';

/** Maximum execution time for git commands (60 seconds) */
const GIT_COMMAND_TIMEOUT_MS = 60000;

/**
 * Executes a git command with cross-runtime support.
 *
 * This function automatically detects the runtime (Bun vs Node.js) and uses
 * the appropriate process spawning method:
 * - In Bun runtime: Uses Bun.spawn for optimal performance
 * - In Node.js runtime (bunx): Uses child_process.spawn for compatibility
 *
 * Features:
 * - Cross-runtime compatibility
 * - Streaming I/O for efficient handling of large outputs
 * - Robust timeout handling
 * - Automatic security validation
 *
 * @param args - Git command arguments (e.g., ['status', '--porcelain'])
 * @param cwd - The working directory to execute the command in
 * @returns A promise that resolves with the stdout and stderr of the command
 * @throws {McpError} If the command fails, times out, or produces an error
 *
 * @example
 * ```typescript
 * const result = await executeGitCommand(
 *   ['status', '--porcelain=v2', '-b'],
 *   '/path/to/repo'
 * );
 * console.log(result.stdout); // Git status output
 * ```
 */
export async function executeGitCommand(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  try {
    validateGitArgs(args);

    /**
     * Pre-flight cwd check. Without this, a missing or non-directory cwd
     * surfaces as a generic ENOENT from spawn, which mapGitError cannot
     * distinguish from a missing git binary — both historically rendered as
     * "Git command not found". Surface the real cause directly.
     */
    if (!existsSync(cwd)) {
      throw new McpError(
        JsonRpcErrorCode.InvalidRequest,
        `Working directory does not exist: ${cwd}`,
        { cwd },
      );
    }
    if (!statSync(cwd).isDirectory()) {
      throw new McpError(
        JsonRpcErrorCode.InvalidRequest,
        `Working directory is not a directory: ${cwd}`,
        { cwd },
      );
    }

    const result = await spawnGitCommand(
      args,
      cwd,
      buildGitEnv(process.env as Record<string, string>),
      GIT_COMMAND_TIMEOUT_MS,
    );

    return result;
  } catch (error) {
    throw mapGitError(error, args[0] || 'unknown');
  }
}
