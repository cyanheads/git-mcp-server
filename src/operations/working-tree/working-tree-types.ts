import { GitOperationOptions } from '../base/operation-result.js';

/**
 * Options for adding files to staging
 */
export interface AddOptions extends GitOperationOptions {
  /** Files to stage */
  files: string[];
  /** Whether to add all files (including untracked) */
  all?: boolean;
  /** Whether to add only updates to already tracked files */
  update?: boolean;
  /** Whether to ignore removal of files */
  ignoreRemoval?: boolean;
  /** Whether to add files with errors */
  force?: boolean;
  /** Whether to only show what would be added */
  dryRun?: boolean;
}

/**
 * Options for committing changes
 */
export interface CommitOptions extends GitOperationOptions {
  /** Commit message */
  message: string;
  /** Whether to allow empty commits */
  allowEmpty?: boolean;
  /** Whether to amend the previous commit */
  amend?: boolean;
  /** Whether to skip pre-commit hooks */
  noVerify?: boolean;
  /** Author of the commit (in format: "Name <email>") */
  author?: string;
  /** Files to commit (if not specified, commits all staged changes) */
  files?: string[];
}

/**
 * Options for checking status
 */
export interface StatusOptions extends GitOperationOptions {
  /** Whether to show untracked files */
  showUntracked?: boolean;
  /** Whether to ignore submodules */
  ignoreSubmodules?: boolean;
  /** Whether to show ignored files */
  showIgnored?: boolean;
  /** Whether to show branch info */
  showBranch?: boolean;
}

/**
 * Represents a file change in the working tree
 */
export interface FileChange {
  /** Path of the file */
  path: string;
  /** Type of change */
  type: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'ignored';
  /** Original path for renamed files */
  originalPath?: string;
  /** Whether the change is staged */
  staged: boolean;
  /** Raw status code from Git */
  raw: string;
}

/**
 * Result of add operation
 */
export interface AddResult {
  /** Files that were staged */
  staged: string[];
  /** Files that were not staged (with reasons) */
  notStaged?: Array<{
    path: string;
    reason: string;
  }>;
  /** Raw command output */
  raw: string;
}

/**
 * Result of commit operation
 */
export interface CommitResult {
  /** Commit hash */
  hash: string;
  /** Number of files changed */
  filesChanged: number;
  /** Number of insertions */
  insertions: number;
  /** Number of deletions */
  deletions: number;
  /** Whether it was an amend */
  amended: boolean;
  /** Raw command output */
  raw: string;
}

/**
 * Result of status operation
 */
export interface StatusResult {
  /** Current branch name */
  branch: string;
  /** Whether the working tree is clean */
  clean: boolean;
  /** Staged changes */
  staged: FileChange[];
  /** Unstaged changes */
  unstaged: FileChange[];
  /** Untracked files */
  untracked: FileChange[];
  /** Ignored files (if requested) */
  ignored?: FileChange[];
  /** Raw command output */
  raw: string;
}
