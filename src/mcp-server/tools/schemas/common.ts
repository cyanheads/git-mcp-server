/**
 * @fileoverview Common schema patterns for git tools
 * @module mcp-server/tools/schemas/common
 */

import { z } from 'zod';

/**
 * Standard path parameter (defaults to session working directory)
 *
 * When set to '.', the tool will use the session working directory
 * set via git_set_working_dir. Otherwise, specifies an absolute path
 * to a git repository.
 */
export const PathSchema = z
  .string()
  .default('.')
  .describe(
    'Path to the Git repository. Defaults to session working directory set via git_set_working_dir.',
  );

/**
 * Force flag for destructive operations
 *
 * When true, bypasses safety checks like uncommitted changes validation.
 * Should be used with extreme caution on destructive operations.
 */
export const ForceSchema = z
  .boolean()
  .default(false)
  .describe('Force the operation, bypassing safety checks.');

/**
 * Dry-run flag for preview mode
 *
 * When true, shows what would be done without actually executing the operation.
 * Useful for previewing merge conflicts, deletions, etc.
 */
export const DryRunSchema = z
  .boolean()
  .default(false)
  .describe('Preview the operation without executing it.');

/**
 * Confirmation flag for protected operations
 *
 * Required for operations on protected branches (main, master, production, etc.)
 * or other dangerous operations that could result in data loss.
 */
export const ConfirmSchema = z
  .enum(['Y', 'y', 'Yes', 'yes'])
  .optional()
  .describe(
    'Explicit confirmation required for protected operations (Y/y/Yes/yes).',
  );

/**
 * Branch name with validation
 *
 * Must follow git branch naming conventions:
 * - Cannot contain special characters: ~^:?*[\\
 * - Cannot contain consecutive dots (..)
 * - Cannot start with . or end with .lock
 */
export const BranchNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^~^:?*\[\\]+$/, 'Invalid branch name format')
  .describe('Branch name (must follow git naming conventions).');

/**
 * Commit reference (hash, branch, or tag)
 *
 * Accepts:
 * - Full commit hashes (40-char SHA-1)
 * - Short commit hashes (7+ chars)
 * - Branch names
 * - Tag names
 * - Relative refs (HEAD~1, HEAD^, etc.)
 */
export const CommitRefSchema = z
  .string()
  .min(1)
  .describe(
    'Commit reference: full/short hash, branch name, tag name, or relative ref (HEAD~1).',
  );

/**
 * Author information
 *
 * Used for commits, filtering logs, etc.
 */
export const AuthorSchema = z.object({
  name: z.string().min(1).describe("Author's name"),
  email: z.string().email().describe("Author's email address"),
});

/**
 * Remote name
 *
 * Must contain only alphanumeric characters, dots, dashes, and underscores.
 * Common values: origin, upstream, fork
 */
export const RemoteNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid remote name format')
  .describe('Remote name (alphanumeric, dots, dashes, underscores only).');

/**
 * Standard success response
 *
 * Used by tools that return a simple success/failure status.
 */
export const SuccessResponseSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  message: z.string().describe('Human-readable summary of the result.'),
});

/**
 * File path (relative to repository root)
 *
 * Must be relative (no leading /) and cannot contain directory traversal (..)
 */
export const FilePathSchema = z
  .string()
  .min(1)
  .regex(/^[^/].*$/, 'File path must be relative to repository root')
  .regex(/^(?!.*\.\.).*$/, 'File path cannot contain directory traversal')
  .describe('File path relative to repository root.');

/**
 * Tag name
 *
 * Similar to branch names but with slightly different rules.
 */
export const TagNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^~^:?*\[\\]+$/, 'Invalid tag name format')
  .describe('Tag name (must follow git naming conventions).');

/**
 * Normalize literal escape sequences in message strings.
 *
 * LLM clients frequently send literal two-character sequences like `\n`
 * (backslash + n) instead of actual newline characters. This normalizes
 * them so git records real newlines in commit/tag/merge messages.
 *
 * Only normalizes sequences that are unambiguously escape sequences —
 * `\n`, `\r`, `\t` — and collapses `\r\n` to `\n` for consistency.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/\\r\\n/g, '\n') // literal \r\n → newline
    .replace(/\\n/g, '\n') // literal \n → newline
    .replace(/\\r/g, '\r') // literal \r → carriage return
    .replace(/\\t/g, '\t'); // literal \t → tab
}

/**
 * Commit message
 *
 * Must be non-empty and within reasonable length limits.
 * Normalizes literal escape sequences from LLM clients.
 */
export const CommitMessageSchema = z
  .string()
  .min(1, 'Commit message cannot be empty')
  .max(10000, 'Commit message too long')
  .transform(normalizeMessage)
  .describe('Commit message.');

/**
 * Pagination limit
 *
 * Used for limiting number of results in logs, commits, etc.
 */
export const LimitSchema = z
  .number()
  .int()
  .min(1)
  .max(1000)
  .optional()
  .describe('Maximum number of items to return (1-1000).');

/**
 * Skip/offset for pagination
 *
 * Used for paginating through results.
 */
export const SkipSchema = z
  .number()
  .int()
  .nonnegative()
  .optional()
  .describe('Number of items to skip for pagination.');

/**
 * Verbose flag
 *
 * When true, includes more detailed information in the output.
 */
export const VerboseSchema = z
  .boolean()
  .default(false)
  .describe('Include verbose/detailed information in output.');

/**
 * Quiet flag
 *
 * When true, suppresses informational output (only shows errors).
 */
export const QuietSchema = z
  .boolean()
  .default(false)
  .describe('Suppress informational output (errors only).');

/**
 * Recursive flag
 *
 * When true, operates recursively on subdirectories.
 */
export const RecursiveSchema = z
  .boolean()
  .default(false)
  .describe('Operate recursively on subdirectories.');

/**
 * All flag
 *
 * When true, includes all items (e.g., all branches, all tags, etc.)
 */
export const AllSchema = z
  .boolean()
  .default(false)
  .describe('Include all items (varies by operation).');

/**
 * Merge strategy
 *
 * Specifies the merge strategy to use for merge operations.
 */
export const MergeStrategySchema = z
  .enum(['ort', 'recursive', 'octopus', 'ours', 'subtree'])
  .optional()
  .describe('Merge strategy to use (ort, recursive, octopus, ours, subtree).');

/**
 * Prune flag
 *
 * When true, removes remote-tracking references that no longer exist on remote.
 */
export const PruneSchema = z
  .boolean()
  .default(false)
  .describe('Prune remote-tracking references that no longer exist on remote.');

/**
 * Depth for shallow clone
 *
 * Creates a shallow clone with history truncated to specified number of commits.
 */
export const DepthSchema = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe('Create a shallow clone with history truncated to N commits.');

/**
 * GPG signing
 *
 * When true, signs commits/tags with GPG.
 */
export const SignSchema = z
  .boolean()
  .optional()
  .describe('Sign the commit/tag with GPG.');

/**
 * No-verify flag
 *
 * When true, bypasses pre-commit and commit-msg hooks.
 * Should be used sparingly.
 */
export const NoVerifySchema = z
  .boolean()
  .default(false)
  .describe('Bypass pre-commit and commit-msg hooks.');
