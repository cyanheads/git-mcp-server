/**
 * @fileoverview Type definitions for Git service operations
 * @module services/git/types
 *
 * This module provides comprehensive TypeScript interfaces for all git operations
 * supported by the git-mcp-server. These types are used by both the CLI provider
 * (wrapping git binary) and the isomorphic provider (isomorphic-git for edge).
 */

import type { RequestContext } from '@/utils/index.js';

// ============================================================================
// Base Context
// ============================================================================

/**
 * Base context for all git operations.
 *
 * Contains the necessary information for executing git commands, including
 * logging context, working directory, and optional tenant information for
 * multi-tenant deployments.
 */
export interface GitOperationContext {
  /** Request context for logging and tracing */
  requestContext: RequestContext;
  /** Working directory (repository path) */
  workingDirectory: string;
  /** Optional tenant ID for multi-tenancy */
  tenantId?: string;
}

// ============================================================================
// Provider Capabilities
// ============================================================================

/**
 * Capabilities supported by a git provider.
 *
 * Different providers have different capabilities:
 * - CLI Provider: All capabilities (full git binary feature set)
 * - Isomorphic Provider: Limited (core operations for edge environments)
 */
export interface GitProviderCapabilities {
  /** Can perform git init */
  init: boolean;
  /** Can perform git clone */
  clone: boolean;
  /** Can create commits */
  commit: boolean;
  /** Can manage branches */
  branch: boolean;
  /** Can merge branches */
  merge: boolean;
  /** Can rebase commits */
  rebase: boolean;
  /** Can manage remotes */
  remote: boolean;
  /** Can fetch from remotes */
  fetch: boolean;
  /** Can push to remotes */
  push: boolean;
  /** Can pull from remotes */
  pull: boolean;
  /** Can create tags */
  tag: boolean;
  /** Can stash changes */
  stash: boolean;
  /** Can manage worktrees */
  worktree: boolean;
  /** Can perform git blame */
  blame: boolean;
  /** Can view reflog */
  reflog: boolean;
  /** Can sign commits (GPG/SSH) */
  signCommits: boolean;
  /** Supports SSH authentication */
  sshAuth: boolean;
  /** Supports HTTP/HTTPS authentication */
  httpAuth: boolean;
  /** Maximum recommended repository size in MB */
  maxRepoSizeMB: number;
}

// ============================================================================
// Repository Operations
// ============================================================================

export interface GitInitOptions {
  /** Path where repository should be initialized */
  path: string;
  /** Initial branch name (default: main) */
  initialBranch?: string;
  /** Create bare repository */
  bare?: boolean;
}

export interface GitInitResult {
  /** Operation success status */
  success: boolean;
  /** Repository path */
  path: string;
  /** Initial branch name */
  initialBranch: string;
  /** Whether repository is bare */
  bare: boolean;
}

export interface GitCloneOptions {
  /** Remote repository URL */
  remoteUrl: string;
  /** Local path for cloned repository */
  localPath: string;
  /** Branch to checkout (default: remote's default branch) */
  branch?: string;
  /** Create shallow clone with limited history */
  depth?: number;
  /** Clone as bare repository */
  bare?: boolean;
  /** Create mirror clone (implies bare) */
  mirror?: boolean;
  /** Include submodules */
  recurseSubmodules?: boolean;
}

export interface GitCloneResult {
  /** Operation success status */
  success: boolean;
  /** Local repository path */
  localPath: string;
  /** Remote URL */
  remoteUrl: string;
  /** Checked out branch */
  branch: string;
}

export interface GitCleanOptions {
  /** Force deletion (required for safety) */
  force: boolean;
  /** Dry run (preview what would be deleted) */
  dryRun?: boolean;
  /** Remove directories */
  directories?: boolean;
  /** Remove ignored files */
  ignored?: boolean;
  /** Interactive mode (not supported in all providers) */
  interactive?: boolean;
}

export interface GitCleanResult {
  /** Operation success status */
  success: boolean;
  /** Files that were (or would be) removed */
  filesRemoved: string[];
  /** Directories that were (or would be) removed */
  directoriesRemoved: string[];
  /** Whether this was a dry run */
  dryRun: boolean;
}

// ============================================================================
// Status & Information
// ============================================================================

export interface GitStatusOptions {
  /** Include untracked files */
  includeUntracked?: boolean;
  /** Ignore submodules */
  ignoreSubmodules?: boolean;
}

export interface GitStatusResult {
  /** Current branch name (null if detached HEAD) */
  currentBranch: string | null;
  /** Changes staged for commit */
  stagedChanges: {
    added?: string[];
    modified?: string[];
    deleted?: string[];
    renamed?: string[];
    copied?: string[];
  };
  /** Changes not staged for commit */
  unstagedChanges: {
    added?: string[];
    modified?: string[];
    deleted?: string[];
  };
  /** Untracked files */
  untrackedFiles: string[];
  /** Files with merge conflicts */
  conflictedFiles: string[];
  /** Whether working directory is clean */
  isClean: boolean;
}

// ============================================================================
// Commit Operations
// ============================================================================

export interface GitAddOptions {
  /** File paths to stage (relative to repository root) */
  paths: string[];
  /** Stage all changes */
  all?: boolean;
  /** Update tracked files only */
  update?: boolean;
  /** Force add (include ignored files) */
  force?: boolean;
  /** Interactive patch mode (not supported in all providers) */
  patch?: boolean;
}

export interface GitAddResult {
  /** Operation success status */
  success: boolean;
  /** Files that were staged */
  stagedFiles: string[];
}

export interface GitCommitOptions {
  /** Commit message */
  message: string;
  /** Author information (uses git config if not provided) */
  author?: {
    name: string;
    email: string;
  };
  /** Amend previous commit */
  amend?: boolean;
  /** Allow empty commit */
  allowEmpty?: boolean;
  /** Sign commit with GPG/SSH */
  sign?: boolean;
  /** Skip pre-commit and commit-msg hooks */
  noVerify?: boolean;
  /** File paths to stage before committing (atomic stage+commit operation) */
  filesToStage?: string[];
  /** If GPG/SSH signing fails, retry without signing instead of failing */
  forceUnsignedOnFailure?: boolean;
}

export interface GitCommitResult {
  /** Operation success status */
  success: boolean;
  /** Commit hash (SHA-1) */
  commitHash: string;
  /** Commit message */
  message: string;
  /** Author name and email */
  author: string;
  /** Commit timestamp (Unix timestamp) */
  timestamp: number;
  /** Files changed in this commit */
  filesChanged: string[];
}

export interface GitLogOptions {
  /** Maximum number of commits to return */
  maxCount?: number;
  /** Number of commits to skip before starting output */
  skip?: number;
  /** Show commits more recent than this date */
  since?: string;
  /** Show commits older than this date */
  until?: string;
  /** Filter commits by author */
  author?: string;
  /** Filter commits that modified this path */
  path?: string;
  /** Filter commits by message content (grep) */
  grep?: string;
  /** Show commits from a specific branch or ref */
  branch?: string;
  /** Include GPG signature verification information */
  showSignature?: boolean;
  /** Show abbreviated one-line output (hash + subject only) */
  oneline?: boolean;
  /** Include file change statistics for each commit */
  stat?: boolean;
  /** Include full diff patch for each commit */
  patch?: boolean;
}

export interface GitCommitInfo {
  /** Full commit hash */
  hash: string;
  /** Short commit hash (7 chars) */
  shortHash: string;
  /** Author name */
  author: string;
  /** Author email */
  authorEmail: string;
  /** Commit timestamp (Unix timestamp) */
  timestamp: number;
  /** Commit subject (first line of message) */
  subject: string;
  /** Commit body (rest of message) */
  body?: string;
  /** Parent commit hashes */
  parents: string[];
  /** References (branches, tags) pointing to this commit */
  refs?: string[];
  /** File change statistics (when stat option is used) */
  stat?: string;
  /** Full diff patch (when patch option is used) */
  patch?: string;
}

export interface GitLogResult {
  /** List of commits */
  commits: GitCommitInfo[];
  /** Total number of commits returned */
  totalCount: number;
}

export interface GitShowOptions {
  /** Git object to show (commit, tree, blob, tag) */
  object: string;
  /** Output format */
  format?: 'raw' | 'json';
  /** Include diffstat */
  stat?: boolean;
  /** View specific file at a given commit reference */
  filePath?: string;
}

export interface GitShowResult {
  /** Object identifier */
  object: string;
  /** Object type */
  type: 'commit' | 'tree' | 'blob' | 'tag';
  /** Object content */
  content: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface GitDiffOptions {
  /** First commit to compare (default: HEAD) */
  commit1?: string;
  /** Second commit to compare (default: working directory) */
  commit2?: string;
  /** Show diff of staged changes */
  staged?: boolean;
  /** Limit diff to specific path(s) */
  path?: string;
  /** Number of context lines */
  unified?: number;
  /** Include untracked files */
  includeUntracked?: boolean;
  /** Show statistics only (diffstat) */
  stat?: boolean;
  /** Show only names of changed files */
  nameOnly?: boolean;
}

export interface GitDiffResult {
  /** Diff output (unified diff format) */
  diff: string;
  /** Number of files changed */
  filesChanged?: number;
  /** Number of insertions */
  insertions?: number;
  /** Number of deletions */
  deletions?: number;
  /** Whether diff contains binary files */
  binary?: boolean;
}

// ============================================================================
// Branch Operations
// ============================================================================

export interface GitBranchOptions {
  /** Operation mode */
  mode: 'list' | 'create' | 'delete' | 'rename';
  /** Branch name (for create/delete/rename) */
  branchName?: string;
  /** New branch name (for rename) */
  newBranchName?: string;
  /** Starting point for new branch */
  startPoint?: string;
  /** Force operation */
  force?: boolean;
  /** Include remote branches in list */
  remote?: boolean;
  /** Filter to show only branches merged into specified commit (defaults to HEAD) */
  merged?: boolean | string;
  /** Filter to show only branches NOT merged into specified commit (defaults to HEAD) */
  noMerged?: boolean | string;
}

export interface GitBranchInfo {
  /** Branch name */
  name: string;
  /** Whether this is the current branch */
  current: boolean;
  /** Commit hash at branch tip */
  commitHash: string;
  /** Upstream branch (if tracking) */
  upstream?: string;
  /** Commits ahead of upstream */
  ahead?: number;
  /** Commits behind upstream */
  behind?: number;
}

/**
 * Result of a git branch operation.
 *
 * This is a discriminated union type based on the operation mode,
 * providing better type safety and inference.
 */
export type GitBranchResult =
  | {
      /** List operation mode */
      mode: 'list';
      /** List of branches */
      branches: GitBranchInfo[];
    }
  | {
      /** Create operation mode */
      mode: 'create';
      /** Created branch name */
      created: string;
    }
  | {
      /** Delete operation mode */
      mode: 'delete';
      /** Deleted branch name */
      deleted: string;
    }
  | {
      /** Rename operation mode */
      mode: 'rename';
      /** Rename information */
      renamed: { from: string; to: string };
    };

export interface GitCheckoutOptions {
  /** Branch name or commit hash to checkout */
  target: string;
  /** Create new branch */
  createBranch?: boolean;
  /** Force checkout (discard local changes) */
  force?: boolean;
  /** Checkout specific paths only */
  paths?: string[];
  /** Set up tracking for the new branch (requires createBranch) */
  track?: boolean;
}

export interface GitCheckoutResult {
  /** Operation success status */
  success: boolean;
  /** Checked out branch or commit */
  target: string;
  /** Whether a new branch was created */
  branchCreated: boolean;
  /** Files that were modified */
  filesModified: string[];
}

export interface GitMergeOptions {
  /** Branch to merge into current branch */
  branch: string;
  /** Merge strategy */
  strategy?: 'ort' | 'recursive' | 'octopus' | 'ours' | 'subtree';
  /** Prevent fast-forward merge */
  noFastForward?: boolean;
  /** Squash commits */
  squash?: boolean;
  /** Custom merge commit message */
  message?: string;
  /** Sign merge commit with GPG/SSH */
  sign?: boolean;
  /** Abort an in-progress merge that has conflicts */
  abort?: boolean;
}

export interface GitMergeResult {
  /** Operation success status */
  success: boolean;
  /** Merge strategy used */
  strategy: string;
  /** Whether merge was fast-forward */
  fastForward: boolean;
  /** Whether merge had conflicts */
  conflicts: boolean;
  /** Files with conflicts */
  conflictedFiles: string[];
  /** Files that were merged */
  mergedFiles: string[];
  /** Merge commit message */
  message: string;
}

export interface GitRebaseOptions {
  /** Rebase operation mode */
  mode?: 'start' | 'continue' | 'abort' | 'skip';
  /** Upstream branch to rebase onto (required for start mode) */
  upstream?: string;
  /** Branch to rebase (default: current) */
  branch?: string;
  /** Interactive rebase (not supported in all providers) */
  interactive?: boolean;
  /** Rebase onto different commit */
  onto?: string;
  /** Preserve merge commits */
  preserve?: boolean;
  /** Sign rebased commits with GPG/SSH */
  sign?: boolean;
}

export interface GitRebaseResult {
  /** Operation success status */
  success: boolean;
  /** Whether rebase had conflicts */
  conflicts: boolean;
  /** Files with conflicts */
  conflictedFiles: string[];
  /** Number of commits rebased */
  rebasedCommits: number;
  /** Current commit during conflict */
  currentCommit?: string;
}

export interface GitCherryPickOptions {
  /** Commit hashes to cherry-pick */
  commits: string[];
  /** Don't create commit (stage changes only) */
  noCommit?: boolean;
  /** Continue after resolving conflicts */
  continueOperation?: boolean;
  /** Abort cherry-pick operation */
  abort?: boolean;
  /** For merge commits, specify which parent to follow (1 for first parent, 2 for second, etc.) */
  mainline?: number;
  /** Merge strategy to use for cherry-pick */
  strategy?: 'ort' | 'recursive' | 'octopus' | 'ours' | 'subtree';
  /** Add Signed-off-by line to the commit message */
  signoff?: boolean;
  /** Sign cherry-picked commits with GPG/SSH */
  sign?: boolean;
}

export interface GitCherryPickResult {
  /** Operation success status */
  success: boolean;
  /** Commits that were cherry-picked */
  pickedCommits: string[];
  /** Whether operation had conflicts */
  conflicts: boolean;
  /** Files with conflicts */
  conflictedFiles: string[];
}

// ============================================================================
// Remote Operations
// ============================================================================

export interface GitRemoteOptions {
  /** Operation mode */
  mode: 'list' | 'add' | 'remove' | 'rename' | 'get-url' | 'set-url';
  /** Remote name */
  name?: string;
  /** Remote URL */
  url?: string;
  /** New remote name (for rename) */
  newName?: string;
  /** Set push URL separately */
  push?: boolean;
}

export interface GitRemoteInfo {
  /** Remote name */
  name: string;
  /** Fetch URL */
  fetchUrl: string;
  /** Push URL (may differ from fetch URL) */
  pushUrl: string;
}

export interface GitRemoteResult {
  /** Operation mode */
  mode: string;
  /** List of remotes (for list mode) */
  remotes?: GitRemoteInfo[];
  /** Added remote (for add mode) */
  added?: { name: string; url: string };
  /** Removed remote name (for remove mode) */
  removed?: string;
  /** Rename information (for rename mode) */
  renamed?: { from: string; to: string };
}

export interface GitFetchOptions {
  /** Remote name (default: origin) */
  remote?: string;
  /** Prune deleted remote branches */
  prune?: boolean;
  /** Fetch tags */
  tags?: boolean;
  /** Fetch depth (for shallow fetch) */
  depth?: number;
}

export interface GitFetchResult {
  /** Operation success status */
  success: boolean;
  /** Remote name */
  remote: string;
  /** References that were fetched */
  fetchedRefs: string[];
  /** References that were pruned */
  prunedRefs: string[];
}

export interface GitPushOptions {
  /** Remote name (default: origin) */
  remote?: string;
  /** Branch name (default: current) */
  branch?: string;
  /** Force push */
  force?: boolean;
  /** Force with lease (safer force) */
  forceWithLease?: boolean;
  /** Set upstream tracking */
  setUpstream?: boolean;
  /** Push tags */
  tags?: boolean;
  /** Dry run */
  dryRun?: boolean;
  /** Delete the specified remote branch */
  delete?: boolean;
  /** Remote branch name to push to (if different from local branch name) */
  remoteBranch?: string;
}

export interface GitPushResult {
  /** Operation success status */
  success: boolean;
  /** Remote name */
  remote: string;
  /** Branch name */
  branch: string;
  /** Whether upstream was set */
  upstreamSet: boolean;
  /** References that were pushed */
  pushedRefs: string[];
  /** References that were rejected */
  rejectedRefs: string[];
}

export interface GitPullOptions {
  /** Remote name (default: origin) */
  remote?: string;
  /** Branch name (default: current) */
  branch?: string;
  /** Use rebase instead of merge */
  rebase?: boolean;
  /** Fast-forward only (fail if can't fast-forward) */
  fastForwardOnly?: boolean;
}

export interface GitPullResult {
  /** Operation success status */
  success: boolean;
  /** Remote name */
  remote: string;
  /** Branch name */
  branch: string;
  /** Integration strategy used */
  strategy: 'merge' | 'rebase' | 'fast-forward';
  /** Whether pull had conflicts */
  conflicts: boolean;
  /** Files that were changed */
  filesChanged: string[];
}

// ============================================================================
// Tag Operations
// ============================================================================

export interface GitTagOptions {
  /** Operation mode */
  mode: 'list' | 'create' | 'delete';
  /** Tag name (for create/delete) */
  tagName?: string;
  /** Commit to tag (default: HEAD) */
  commit?: string;
  /** Tag message (for annotated tags) */
  message?: string;
  /** Create annotated tag */
  annotated?: boolean;
  /** Sign tag with GPG/SSH (implies annotated) */
  sign?: boolean;
  /** If signing fails, retry without signing instead of failing */
  forceUnsignedOnFailure?: boolean;
  /** Force tag creation */
  force?: boolean;
}

export interface GitTagInfo {
  /** Tag name */
  name: string;
  /** Commit hash */
  commit: string;
  /** Tag message (for annotated tags) */
  message?: string;
  /** Tagger name and email */
  tagger?: string;
  /** Tag creation timestamp */
  timestamp?: number;
}

export interface GitTagResult {
  /** Operation mode */
  mode: string;
  /** List of tags (for list mode) */
  tags?: GitTagInfo[];
  /** Created tag name (for create mode) */
  created?: string;
  /** Deleted tag name (for delete mode) */
  deleted?: string;
}

// ============================================================================
// Stash Operations
// ============================================================================

export interface GitStashOptions {
  /** Operation mode */
  mode: 'list' | 'push' | 'pop' | 'apply' | 'drop' | 'clear';
  /** Stash message (for push) */
  message?: string;
  /** Stash reference (for pop/apply/drop) */
  stashRef?: string;
  /** Include untracked files */
  includeUntracked?: boolean;
  /** Keep index (don't revert staged changes) */
  keepIndex?: boolean;
}

export interface GitStashInfo {
  /** Stash reference (e.g., stash@{0}) */
  ref: string;
  /** Stash index */
  index: number;
  /** Branch name when stashed */
  branch: string;
  /** Stash description */
  description: string;
  /** Stash creation timestamp */
  timestamp: number;
}

export interface GitStashResult {
  /** Operation mode */
  mode: string;
  /** List of stashes (for list mode) */
  stashes?: GitStashInfo[];
  /** Created stash reference (for push mode) */
  created?: string;
  /** Applied stash reference (for pop/apply mode) */
  applied?: string;
  /** Dropped stash reference (for drop mode) */
  dropped?: string;
  /** Whether operation had conflicts */
  conflicts?: boolean;
}

// ============================================================================
// Worktree Operations
// ============================================================================

export interface GitWorktreeOptions {
  /** Operation mode */
  mode: 'list' | 'add' | 'remove' | 'move' | 'prune';
  /** Worktree path */
  path?: string;
  /** New worktree path (for move) */
  newPath?: string;
  /** Commit-ish to checkout */
  commitish?: string;
  /** Branch name */
  branch?: string;
  /** Force operation */
  force?: boolean;
  /** Create detached HEAD */
  detach?: boolean;
  /** Provide detailed output for worktree operations */
  verbose?: boolean;
  /** Preview the operation without executing it (for prune operation) */
  dryRun?: boolean;
}

export interface GitWorktreeInfo {
  /** Worktree path */
  path: string;
  /** HEAD commit */
  head: string;
  /** Branch name (if not detached) */
  branch?: string;
  /** Whether worktree is bare */
  bare: boolean;
  /** Whether HEAD is detached */
  detached: boolean;
  /** Whether worktree is locked */
  locked: boolean;
  /** Whether worktree is prunable */
  prunable: boolean;
}

export interface GitWorktreeResult {
  /** Operation mode */
  mode: string;
  /** List of worktrees (for list mode) */
  worktrees?: GitWorktreeInfo[];
  /** Added worktree path (for add mode) */
  added?: string;
  /** Removed worktree path (for remove mode) */
  removed?: string;
  /** Move information (for move mode) */
  moved?: { from: string; to: string };
  /** Pruned worktree paths (for prune mode) */
  pruned?: string[];
}

// ============================================================================
// Additional Operations
// ============================================================================

export interface GitResetOptions {
  /** Reset mode */
  mode: 'soft' | 'mixed' | 'hard' | 'merge' | 'keep';
  /** Commit to reset to (default: HEAD) */
  commit?: string;
  /** Specific paths to reset */
  paths?: string[];
}

export interface GitResetResult {
  /** Operation success status */
  success: boolean;
  /** Reset mode */
  mode: string;
  /** Commit hash after reset */
  commit: string;
  /** Files that were reset */
  filesReset: string[];
}

export interface GitBlameOptions {
  /** File path to blame (relative to repository root) */
  file: string;
  /** Start line number (1-indexed) */
  startLine?: number;
  /** End line number (1-indexed) */
  endLine?: number;
  /** Ignore whitespace changes */
  ignoreWhitespace?: boolean;
}

export interface GitBlameLine {
  /** Line number */
  lineNumber: number;
  /** Commit hash */
  commitHash: string;
  /** Author name */
  author: string;
  /** Commit timestamp */
  timestamp: number;
  /** Line content */
  content: string;
}

export interface GitBlameResult {
  /** Operation success status */
  success: boolean;
  /** File path */
  file: string;
  /** Blame information for each line */
  lines: GitBlameLine[];
  /** Total number of lines */
  totalLines: number;
}

export interface GitReflogOptions {
  /** Reference to show reflog for (default: HEAD) */
  ref?: string;
  /** Maximum number of entries to return */
  maxCount?: number;
}

export interface GitReflogEntry {
  /** Commit hash */
  hash: string;
  /** Reference name (e.g., HEAD@{0}) */
  refName: string;
  /** Action performed (e.g., commit, checkout) */
  action: string;
  /** Action description */
  message: string;
  /** Action timestamp */
  timestamp: number;
}

export interface GitReflogResult {
  /** Operation success status */
  success: boolean;
  /** Reference name */
  ref: string;
  /** Reflog entries */
  entries: GitReflogEntry[];
  /** Total number of entries */
  totalEntries: number;
}
