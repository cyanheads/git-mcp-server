/**
 * @fileoverview Git diff tool - view differences between commits/files
 * @module mcp-server/tools/definitions/git-diff
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { CommitRefSchema, PathSchema } from '../schemas/common.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_diff';
const TOOL_TITLE = 'Git Diff';
const TOOL_DESCRIPTION =
  'View differences between commits, branches, or working tree. Shows changes in unified diff format.';

/**
 * Files automatically excluded from diff output by default to prevent
 * context bloat. These are generated/managed by package managers and
 * rarely contain meaningful information for code review.
 */
const AUTO_EXCLUDE_PATTERNS = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'poetry.lock',
  'Pipfile.lock',
  'uv.lock',
  'composer.lock',
  'Gemfile.lock',
  'go.sum',
  'Cargo.lock',
  'flake.lock',
  'pubspec.lock',
  'mix.lock',
  'Podfile.lock',
  'packages.lock.json',
] as const;

const InputSchema = z
  .object({
    path: PathSchema,
    target: CommitRefSchema.optional().describe(
      'Target commit/branch to compare against. If not specified, shows unstaged changes in working tree.',
    ),
    source: CommitRefSchema.optional().describe(
      'Source commit/branch to compare from. If target is specified but not source, compares target against working tree.',
    ),
    paths: z
      .array(z.string())
      .optional()
      .describe(
        'Limit diff to specific file paths (relative to repository root).',
      ),
    staged: z
      .boolean()
      .default(false)
      .describe('Show diff of staged changes instead of unstaged.'),
    includeUntracked: z
      .boolean()
      .default(false)
      .describe(
        'Include untracked files in the diff. Useful for reviewing all upcoming changes.',
      ),
    nameOnly: z
      .boolean()
      .default(false)
      .describe('Show only names of changed files, not the diff content.'),
    stat: z
      .boolean()
      .default(false)
      .describe(
        'Show diffstat (summary of changes) instead of full diff content.',
      ),
    contextLines: z
      .number()
      .int()
      .min(0)
      .max(100)
      .default(3)
      .describe('Number of context lines to show around changes.'),
    autoExclude: z
      .boolean()
      .default(true)
      .describe(
        'Automatically exclude lock files and other generated files (e.g., package-lock.json, yarn.lock, bun.lock, poetry.lock, go.sum) from diff output to reduce context bloat. Set to false if you need to inspect these files.',
      ),
  })
  .strict();

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  diff: z.string().describe('The diff output in unified diff format.'),
  filesChanged: z.number().int().describe('Number of files with differences.'),
  insertions: z
    .number()
    .int()
    .optional()
    .describe('Total number of line insertions.'),
  deletions: z
    .number()
    .int()
    .optional()
    .describe('Total number of line deletions.'),
  excludedFiles: z
    .array(z.string())
    .optional()
    .describe(
      'Files that were automatically excluded from the diff (e.g., lock files). Call again with autoExclude=false to include them.',
    ),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitDiffLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Map tool interface to GitDiffOptions
  // Tool uses user-friendly names, provider uses git terminology
  const result = await provider.diff(
    {
      // Only include optional properties when defined (exactOptionalPropertyTypes)
      ...(input.target && { commit2: input.target }),
      ...(input.source && { commit1: input.source }),
      ...(input.paths?.length && { paths: input.paths }),
      staged: input.staged,
      includeUntracked: input.includeUntracked,
      nameOnly: input.nameOnly,
      stat: input.stat,
      unified: input.contextLines,
      ...(input.autoExclude && {
        excludePatterns: [...AUTO_EXCLUDE_PATTERNS],
      }),
    },
    {
      workingDirectory: targetPath,
      requestContext: appContext,
      tenantId: appContext.tenantId || 'default-tenant',
    },
  );

  return {
    success: true,
    diff: result.diff,
    filesChanged: result.filesChanged || 0,
    insertions: result.insertions,
    deletions: result.deletions,
    ...(result.excludedFiles?.length && {
      excludedFiles: result.excludedFiles,
    }),
  };
}

/**
 * Filter git_diff output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Files changed and stats only (no diff content)
 * - standard: Above + diff content (RECOMMENDED, may be large)
 * - full: Complete output (same as standard)
 */
function filterGitDiffOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Summary stats only, no diff content
  if (level === 'minimal') {
    return {
      success: result.success,
      filesChanged: result.filesChanged,
      insertions: result.insertions,
      deletions: result.deletions,
      excludedFiles: result.excludedFiles,
    };
  }

  // standard & full: Complete output including diff content
  // (LLMs need full diff to understand changes)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitDiffOutput,
});

export const gitDiffTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], createToolHandler(gitDiffLogic)),
  responseFormatter,
};
