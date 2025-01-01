import { GitToolContent } from '../../types.js';
import { GitMcpError } from '../../errors/error-types.js';

/**
 * Represents the result of a Git operation with proper type safety
 */
export interface GitOperationResult<T = void> {
  /** Whether the operation was successful */
  success: boolean;
  
  /** Operation-specific data if successful */
  data?: T;
  
  /** Error information if operation failed */
  error?: GitMcpError;
  
  /** Standard MCP tool response content */
  content: GitToolContent[];
  
  /** Additional metadata about the operation */
  meta?: Record<string, unknown>;
}

/**
 * Base interface for all Git operation options
 */
export interface GitOperationOptions {
  /** Operation path override */
  path?: string;
  
  /** Whether to use caching */
  useCache?: boolean;
  
  /** Whether to invalidate cache after operation */
  invalidateCache?: boolean;
}

/**
 * Common result types for Git operations
 */
import { CommandResult as BaseCommandResult } from '../../utils/command.js';

export interface CommandResult extends BaseCommandResult {
  // Extend the base command result with any additional fields we need
}

export interface ListResult {
  items: string[];
  raw: string;
}

export interface StatusResult {
  staged: string[];
  unstaged: string[];
  untracked: string[];
  raw: string;
}

export interface BranchResult {
  current: string;
  branches: string[];
  raw: string;
}

export interface TagResult {
  tags: string[];
  raw: string;
}

export interface RemoteResult {
  remotes: Array<{
    name: string;
    url: string;
    purpose: 'fetch' | 'push';
  }>;
  raw: string;
}

export interface StashResult {
  stashes: Array<{
    index: number;
    message: string;
  }>;
  raw: string;
}
