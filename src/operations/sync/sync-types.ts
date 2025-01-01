import { GitOperationOptions } from '../base/operation-result.js';

/**
 * Options for push operations
 */
export interface PushOptions extends GitOperationOptions {
  /** Remote to push to */
  remote?: string;
  /** Branch to push */
  branch: string;
  /** Whether to force push */
  force?: boolean;
  /** Whether to force push with lease */
  forceWithLease?: boolean;
  /** Whether to push all branches */
  all?: boolean;
  /** Whether to push tags */
  tags?: boolean;
  /** Whether to skip pre-push hooks */
  noVerify?: boolean;
  /** Whether to set upstream for branch */
  setUpstream?: boolean;
  /** Whether to delete remote branches that were deleted locally */
  prune?: boolean;
}

/**
 * Options for pull operations
 */
export interface PullOptions extends GitOperationOptions {
  /** Remote to pull from */
  remote?: string;
  /** Branch to pull */
  branch: string;
  /** Whether to rebase instead of merge */
  rebase?: boolean;
  /** Whether to automatically stash/unstash changes */
  autoStash?: boolean;
  /** Whether to allow unrelated histories */
  allowUnrelated?: boolean;
  /** Whether to fast-forward only */
  ff?: 'only' | 'no' | true;
  /** Strategy to use when merging */
  strategy?: 'recursive' | 'resolve' | 'octopus' | 'ours' | 'subtree';
  /** Strategy options */
  strategyOption?: string[];
}

/**
 * Options for fetch operations
 */
export interface FetchOptions extends GitOperationOptions {
  /** Remote to fetch from */
  remote?: string;
  /** Whether to fetch all remotes */
  all?: boolean;
  /** Whether to prune remote branches */
  prune?: boolean;
  /** Whether to prune tags */
  pruneTags?: boolean;
  /** Whether to fetch tags */
  tags?: boolean;
  /** Whether to fetch only tags */
  tagsOnly?: boolean;
  /** Whether to force fetch tags */
  forceTags?: boolean;
  /** Depth of history to fetch */
  depth?: number;
  /** Whether to update submodules */
  recurseSubmodules?: boolean | 'on-demand';
  /** Whether to show progress */
  progress?: boolean;
}

/**
 * Result of push operation
 */
export interface PushResult {
  /** Remote that was pushed to */
  remote: string;
  /** Branch that was pushed */
  branch: string;
  /** Whether force push was used */
  forced: boolean;
  /** New remote ref */
  newRef?: string;
  /** Old remote ref */
  oldRef?: string;
  /** Summary of changes */
  summary: {
    created?: string[];
    deleted?: string[];
    updated?: string[];
    rejected?: string[];
  };
  /** Raw command output */
  raw: string;
}

/**
 * Result of pull operation
 */
export interface PullResult {
  /** Remote that was pulled from */
  remote: string;
  /** Branch that was pulled */
  branch: string;
  /** Whether rebase was used */
  rebased: boolean;
  /** Files changed */
  filesChanged: number;
  /** Number of insertions */
  insertions: number;
  /** Number of deletions */
  deletions: number;
  /** Summary of changes */
  summary: {
    merged?: string[];
    conflicts?: string[];
  };
  /** Raw command output */
  raw: string;
}

/**
 * Result of fetch operation
 */
export interface FetchResult {
  /** Remote that was fetched from */
  remote?: string;
  /** Summary of changes */
  summary: {
    branches?: Array<{
      name: string;
      oldRef?: string;
      newRef: string;
    }>;
    tags?: Array<{
      name: string;
      oldRef?: string;
      newRef: string;
    }>;
    pruned?: string[];
  };
  /** Raw command output */
  raw: string;
}
