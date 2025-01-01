import { GitOperationOptions } from '../base/operation-result.js';

/**
 * Options for listing branches
 */
export interface BranchListOptions extends GitOperationOptions {
  /** Show remote branches */
  remotes?: boolean;
  /** Show all branches (local and remote) */
  all?: boolean;
  /** Show only branches containing the specified commit */
  contains?: string;
  /** Show only branches merged into the specified commit */
  merged?: string;
  /** Show only branches not merged into the specified commit */
  noMerged?: string;
}

/**
 * Options for creating branches
 */
export interface BranchCreateOptions extends GitOperationOptions {
  /** Name of the branch to create */
  name: string;
  /** Whether to force create even if branch exists */
  force?: boolean;
  /** Set up tracking mode (true = --track, false = --no-track) */
  track?: boolean;
  /** Set upstream for push/pull */
  setUpstream?: boolean;
  /** Start point (commit/branch) for the new branch */
  startPoint?: string;
}

/**
 * Options for deleting branches
 */
export interface BranchDeleteOptions extends GitOperationOptions {
  /** Name of the branch to delete */
  name: string;
  /** Whether to force delete even if not merged */
  force?: boolean;
  /** Also delete the branch from remotes */
  remote?: boolean;
}

/**
 * Options for checking out branches
 */
export interface CheckoutOptions extends GitOperationOptions {
  /** Branch/commit/tag to check out */
  target: string;
  /** Whether to force checkout even with local changes */
  force?: boolean;
  /** Create a new branch and check it out */
  newBranch?: string;
  /** Track the remote branch */
  track?: boolean;
}

/**
 * Structured branch information
 */
export interface BranchInfo {
  /** Branch name */
  name: string;
  /** Whether this is the current branch */
  current: boolean;
  /** Remote tracking branch if any */
  tracking?: string;
  /** Whether the branch is ahead/behind tracking branch */
  status?: {
    ahead: number;
    behind: number;
  };
  /** Whether this is a remote branch */
  remote: boolean;
  /** Latest commit hash */
  commit?: string;
  /** Latest commit message */
  message?: string;
}

/**
 * Result of branch listing operation
 */
export interface BranchListResult {
  /** Current branch name */
  current: string;
  /** List of all branches */
  branches: BranchInfo[];
  /** Raw command output */
  raw: string;
}

/**
 * Result of branch creation operation
 */
export interface BranchCreateResult {
  /** Name of created branch */
  name: string;
  /** Starting point of the branch */
  startPoint?: string;
  /** Whether tracking was set up */
  tracking?: string;
  /** Raw command output */
  raw: string;
}

/**
 * Result of branch deletion operation
 */
export interface BranchDeleteResult {
  /** Name of deleted branch */
  name: string;
  /** Whether it was force deleted */
  forced: boolean;
  /** Raw command output */
  raw: string;
}

/**
 * Result of checkout operation
 */
export interface CheckoutResult {
  /** Target that was checked out */
  target: string;
  /** Whether a new branch was created */
  newBranch?: string;
  /** Previous HEAD position */
  previousHead?: string;
  /** Raw command output */
  raw: string;
}
