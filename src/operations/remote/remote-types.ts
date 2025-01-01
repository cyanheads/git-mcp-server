import { GitOperationOptions } from '../base/operation-result.js';

/**
 * Options for listing remotes
 */
export interface RemoteListOptions extends GitOperationOptions {
  /** Show remote URLs */
  verbose?: boolean;
}

/**
 * Options for adding remotes
 */
export interface RemoteAddOptions extends GitOperationOptions {
  /** Name of the remote */
  name: string;
  /** URL of the remote */
  url: string;
  /** Whether to fetch immediately */
  fetch?: boolean;
  /** Tags to fetch (--tags, --no-tags) */
  tags?: boolean;
  /** Mirror mode (--mirror=fetch or --mirror=push) */
  mirror?: 'fetch' | 'push';
}

/**
 * Options for removing remotes
 */
export interface RemoteRemoveOptions extends GitOperationOptions {
  /** Name of the remote */
  name: string;
}

/**
 * Options for updating remote URLs
 */
export interface RemoteSetUrlOptions extends GitOperationOptions {
  /** Name of the remote */
  name: string;
  /** New URL for the remote */
  url: string;
  /** Whether this is a push URL */
  pushUrl?: boolean;
  /** Add URL instead of changing existing URLs */
  add?: boolean;
  /** Delete URL instead of changing it */
  delete?: boolean;
}

/**
 * Options for pruning remotes
 */
export interface RemotePruneOptions extends GitOperationOptions {
  /** Name of the remote */
  name: string;
  /** Whether to show what would be done */
  dryRun?: boolean;
}

/**
 * Represents a remote configuration
 */
export interface RemoteConfig {
  /** Remote name */
  name: string;
  /** Fetch URL */
  fetchUrl: string;
  /** Push URL (if different from fetch) */
  pushUrl?: string;
  /** Remote branches tracked */
  branches?: string[];
  /** Whether tags are fetched */
  fetchTags?: boolean;
  /** Mirror configuration */
  mirror?: 'fetch' | 'push';
}

/**
 * Result of remote listing operation
 */
export interface RemoteListResult {
  /** List of remotes */
  remotes: RemoteConfig[];
  /** Raw command output */
  raw: string;
}

/**
 * Result of remote add operation
 */
export interface RemoteAddResult {
  /** Added remote configuration */
  remote: RemoteConfig;
  /** Raw command output */
  raw: string;
}

/**
 * Result of remote remove operation
 */
export interface RemoteRemoveResult {
  /** Name of removed remote */
  name: string;
  /** Raw command output */
  raw: string;
}

/**
 * Result of remote set-url operation
 */
export interface RemoteSetUrlResult {
  /** Updated remote configuration */
  remote: RemoteConfig;
  /** Raw command output */
  raw: string;
}

/**
 * Result of remote prune operation
 */
export interface RemotePruneResult {
  /** Name of pruned remote */
  name: string;
  /** Branches that were pruned */
  prunedBranches: string[];
  /** Raw command output */
  raw: string;
}
