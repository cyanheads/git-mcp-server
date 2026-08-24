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
 * Branch name with validation
 *
 * Must follow git branch naming conventions:
 * - Cannot start with `-` (parsed as an option flag by git — argument injection)
 * - Cannot contain special characters: ~^:?*[\\
 * - Cannot contain consecutive dots (..)
 * - Cannot start with . or end with .lock
 */
export const BranchNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((s) => !s.startsWith('-'), 'Branch name must not start with "-"')
  .refine(
    (s) => /^[^~^:?*\[\\]+$/.test(s),
    'Branch name contains invalid characters',
  )
  .describe(
    'Branch name (must follow git naming conventions, no leading "-").',
  );

/**
 * Commit reference (hash, branch, or tag)
 *
 * Accepts:
 * - Full commit hashes (40-char SHA-1)
 * - Short commit hashes (7+ chars)
 * - Branch names
 * - Tag names
 * - Relative refs (HEAD~1, HEAD^, etc.)
 *
 * Rejects refs starting with `-` to prevent argument injection — a ref like
 * `--upload-pack=evil` would otherwise be parsed by git as an option flag
 * when passed positionally (CVE-2017-1000117 class).
 */
export const CommitRefSchema = z
  .string()
  .min(1)
  .refine((s) => !s.startsWith('-'), 'Commit ref must not start with "-"')
  .describe(
    'Commit reference: full/short hash, branch name, tag name, or relative ref (HEAD~1). Must not start with "-".',
  );

/**
 * Remote name
 *
 * Must contain only alphanumeric characters, dots, dashes, and underscores,
 * and must not start with `-` (would be parsed as an option flag by git).
 * Common values: origin, upstream, fork
 */
export const RemoteNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9._]+(?:[-._a-zA-Z0-9]*)$/, 'Invalid remote name format')
  .describe(
    'Remote name (alphanumeric, dots, dashes, underscores; must not start with "-").',
  );

/**
 * Tag name
 *
 * Similar to branch names. Cannot start with `-` (parsed as option by git).
 */
export const TagNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((s) => !s.startsWith('-'), 'Tag name must not start with "-"')
  .refine(
    (s) => /^[^~^:?*\[\\]+$/.test(s),
    'Tag name contains invalid characters',
  )
  .describe('Tag name (must follow git naming conventions, no leading "-").');

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
 * No-verify flag
 *
 * When true, bypasses pre-commit and commit-msg hooks.
 * Should be used sparingly.
 */
export const NoVerifySchema = z
  .boolean()
  .default(false)
  .describe('Bypass pre-commit and commit-msg hooks.');

/**
 * Git repository URL — for `git clone`, `git remote add`, `git remote set-url`.
 *
 * Rejects strings whose host or path component starts with `-`, which would
 * be parsed by git (or its delegate, e.g. ssh) as an option flag — the
 * CVE-2017-1000117 / GHSA-86j2-w37r-q256 argument-injection class. Requires
 * a recognized scheme: `https://`, `http://`, `ssh://`, `git://`, `file://`,
 * scp-style `user@host:path`, or an absolute filesystem path.
 *
 * Service operations should also emit `--end-of-options` before positional
 * URL/path args as defense in depth.
 */
const URL_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i;
const SCP_STYLE_PATTERN = /^([\w][\w.+-]*)@([\w.-]+):(.*)$/;
const WINDOWS_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;

function isRecognizedGitUrl(s: string): boolean {
  if (WINDOWS_PATH_PATTERN.test(s)) return true;
  if (s.startsWith('/')) return true;

  const schemeMatch = s.match(URL_SCHEME_PATTERN);
  if (schemeMatch) {
    const allowedSchemes = new Set(['https', 'http', 'ssh', 'git', 'file']);
    return allowedSchemes.has(schemeMatch[1]!.toLowerCase());
  }

  return SCP_STYLE_PATTERN.test(s);
}

function hostOrPathHasLeadingDash(s: string): boolean {
  // Reject things like `ssh://-oProxyCommand=evil` — the part after `://`
  // would be passed as host to ssh, which parses it as an option.
  const schemeMatch = s.match(URL_SCHEME_PATTERN);
  if (schemeMatch && schemeMatch[2]!.startsWith('-')) {
    return true;
  }

  // Reject `user@host:-path` — the path after `:` would be parsed as a flag.
  const scpMatch = s.match(SCP_STYLE_PATTERN);
  if (scpMatch && scpMatch[3]!.startsWith('-')) {
    return true;
  }

  return false;
}

export const GitUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((s) => !s.startsWith('-'), 'URL must not start with "-"')
  .refine(
    (s) => !hostOrPathHasLeadingDash(s),
    'URL host or path segment must not start with "-" (argument injection guard)',
  )
  .refine(
    isRecognizedGitUrl,
    'URL must use a recognized scheme (https/ssh/git/file), scp-style user@host:path, or be an absolute filesystem path',
  )
  .describe(
    'Git repository URL: HTTP(S), SSH (ssh://… or user@host:path), git://, file://, or an absolute filesystem path. Must not start with "-" and no segment may start with "-".',
  );

/**
 * File path argument going positionally to git (e.g., `git add <path>`).
 *
 * Rejects leading `-` to prevent the path being parsed as an option.
 * Permissive otherwise — git tools accept a wide range of path syntaxes
 * (relative, absolute, glob, `:(exclude)pathspec`, etc.). Tool layer
 * sanitization (`sanitization.sanitizePath`) handles traversal concerns.
 */
export const GitFilePathSchema = z
  .string()
  .min(1)
  .refine((s) => !s.startsWith('-'), 'File path must not start with "-"')
  .describe('File path (must not start with "-").');
