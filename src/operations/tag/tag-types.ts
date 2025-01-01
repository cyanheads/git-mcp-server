import { GitOperationOptions } from '../base/operation-result.js';

/**
 * Options for listing tags
 */
export interface TagListOptions extends GitOperationOptions {
  /** Show tag message */
  showMessage?: boolean;
  /** Sort tags by specific key */
  sort?: 'version' | 'creatordate' | 'taggerdate';
  /** Show only tags containing the specified commit */
  contains?: string;
  /** Match tags with pattern */
  pattern?: string;
}

/**
 * Options for creating tags
 */
export interface TagCreateOptions extends GitOperationOptions {
  /** Name of the tag to create */
  name: string;
  /** Tag message (creates annotated tag) */
  message?: string;
  /** Whether to force create even if tag exists */
  force?: boolean;
  /** Create a signed tag */
  sign?: boolean;
  /** Specific commit to tag */
  commit?: string;
}

/**
 * Options for deleting tags
 */
export interface TagDeleteOptions extends GitOperationOptions {
  /** Name of the tag to delete */
  name: string;
  /** Whether to force delete */
  force?: boolean;
  /** Also delete the tag from remotes */
  remote?: boolean;
}

/**
 * Structured tag information
 */
export interface TagInfo {
  /** Tag name */
  name: string;
  /** Whether this is an annotated tag */
  annotated: boolean;
  /** Tag message if annotated */
  message?: string;
  /** Tagger information if annotated */
  tagger?: {
    name: string;
    email: string;
    date: string;
  };
  /** Commit that is tagged */
  commit: string;
  /** Whether this is a signed tag */
  signed: boolean;
}

/**
 * Result of tag listing operation
 */
export interface TagListResult {
  /** List of all tags */
  tags: TagInfo[];
  /** Raw command output */
  raw: string;
}

/**
 * Result of tag creation operation
 */
export interface TagCreateResult {
  /** Name of created tag */
  name: string;
  /** Whether it's an annotated tag */
  annotated: boolean;
  /** Whether it's signed */
  signed: boolean;
  /** Tagged commit */
  commit?: string;
  /** Raw command output */
  raw: string;
}

/**
 * Result of tag deletion operation
 */
export interface TagDeleteResult {
  /** Name of deleted tag */
  name: string;
  /** Whether it was force deleted */
  forced: boolean;
  /** Raw command output */
  raw: string;
}
