import { ExecOptions } from 'child_process';

export enum ErrorCode {
  InvalidParams = 'InvalidParams',
  InternalError = 'InternalError',
  InvalidState = 'InvalidState'
}

export interface GitOptions {
  /**
   * Absolute path to the working directory
   * Example: /Users/username/projects/my-repo
   */
  cwd?: string;
  execOptions?: ExecOptions;
}

export interface GitToolContent {
  type: string;
  text: string;
}

export interface GitToolResult {
  content: GitToolContent[];
  _meta?: Record<string, unknown>;
}

export interface GitToolContext {
  operation: string;
  path?: string;
  options?: GitOptions;
}

// Base interface for operations that require a path
export interface BasePathOptions {
  /**
   * MUST be an absolute path to the repository
   * Example: /Users/username/projects/my-repo
   * If not provided, will use GIT_DEFAULT_PATH from environment
   */
  path?: string;
}

// Tool-specific interfaces
export interface InitOptions extends GitOptions, BasePathOptions {}

export interface CloneOptions extends GitOptions, BasePathOptions {
  /**
   * URL of the repository to clone
   */
  url: string;
}

export interface AddOptions extends GitOptions, BasePathOptions {
  /**
   * Array of absolute paths to files to stage
   * Example: /Users/username/projects/my-repo/src/file.js
   */
  files: string[];
}

export interface CommitOptions extends GitOptions, BasePathOptions {
  message: string;
}

export interface PushPullOptions extends GitOptions, BasePathOptions {
  remote?: string;
  branch: string;
  force?: boolean;  // Allow force push/pull
  noVerify?: boolean;  // Skip pre-push/pre-pull hooks
  tags?: boolean;  // Include tags
}

export interface BranchOptions extends GitOptions, BasePathOptions {
  name: string;
  force?: boolean;  // Allow force operations
  track?: boolean;  // Set up tracking mode
  setUpstream?: boolean;  // Set upstream for push/pull
}

export interface CheckoutOptions extends GitOptions, BasePathOptions {
  target: string;
}

export interface TagOptions extends GitOptions, BasePathOptions {
  name: string;
  message?: string;
  force?: boolean;  // Allow force operations
  annotated?: boolean;  // Create an annotated tag
  sign?: boolean;  // Create a signed tag
}

export interface RemoteOptions extends GitOptions, BasePathOptions {
  name: string;
  url?: string;
  force?: boolean;  // Allow force operations
  mirror?: boolean;  // Mirror all refs
  tags?: boolean;  // Include tags
}

export interface StashOptions extends GitOptions, BasePathOptions {
  message?: string;
  index?: number;
  includeUntracked?: boolean;  // Include untracked files
  keepIndex?: boolean;  // Keep staged changes
  all?: boolean;  // Include ignored files
}

// New bulk action interfaces
export interface BulkActionStage {
  type: 'stage';
  files?: string[]; // If not provided, stages all files
}

export interface BulkActionCommit {
  type: 'commit';
  message: string;
}

export interface BulkActionPush {
  type: 'push';
  remote?: string;
  branch: string;
}

export type BulkAction = BulkActionStage | BulkActionCommit | BulkActionPush;

export interface BulkActionOptions extends GitOptions, BasePathOptions {
  actions: BulkAction[];
}

// Type guard functions
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/');
}

export function validatePath(path?: string): boolean {
  return !path || isAbsolutePath(path);
}

export function isInitOptions(obj: any): obj is InitOptions {
  return obj && validatePath(obj.path);
}

export function isCloneOptions(obj: any): obj is CloneOptions {
  return obj && 
    typeof obj.url === 'string' &&
    validatePath(obj.path);
}

export function isAddOptions(obj: any): obj is AddOptions {
  return obj && 
    validatePath(obj.path) && 
    Array.isArray(obj.files) &&
    obj.files.every((f: any) => typeof f === 'string' && isAbsolutePath(f));
}

export function isCommitOptions(obj: any): obj is CommitOptions {
  return obj && 
    validatePath(obj.path) && 
    typeof obj.message === 'string';
}

export function isPushPullOptions(obj: any): obj is PushPullOptions {
  return obj && 
    validatePath(obj.path) && 
    typeof obj.branch === 'string';
}

export function isBranchOptions(obj: any): obj is BranchOptions {
  return obj && 
    validatePath(obj.path) && 
    typeof obj.name === 'string';
}

export function isCheckoutOptions(obj: any): obj is CheckoutOptions {
  return obj && 
    validatePath(obj.path) && 
    typeof obj.target === 'string';
}

export function isTagOptions(obj: any): obj is TagOptions {
  return obj && 
    validatePath(obj.path) && 
    typeof obj.name === 'string';
}

export function isRemoteOptions(obj: any): obj is RemoteOptions {
  return obj && 
    validatePath(obj.path) && 
    typeof obj.name === 'string';
}

export function isStashOptions(obj: any): obj is StashOptions {
  return obj && validatePath(obj.path);
}

export function isPathOnly(obj: any): obj is BasePathOptions {
  return obj && validatePath(obj.path);
}

export function isBulkActionOptions(obj: any): obj is BulkActionOptions {
  if (!obj || !validatePath(obj.path) || !Array.isArray(obj.actions)) {
    return false;
  }

  return obj.actions.every((action: any) => {
    if (!action || typeof action.type !== 'string') {
      return false;
    }

    switch (action.type) {
      case 'stage':
        return !action.files || (Array.isArray(action.files) && 
          action.files.every((f: any) => typeof f === 'string' && isAbsolutePath(f)));
      case 'commit':
        return typeof action.message === 'string';
      case 'push':
        return typeof action.branch === 'string';
      default:
        return false;
    }
  });
}
