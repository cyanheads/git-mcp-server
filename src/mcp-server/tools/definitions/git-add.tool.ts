/**
 * @fileoverview Git add tool - stage files for commit
 * @module mcp-server/tools/definitions/git-add
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, AllSchema } from '../schemas/common.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';
import { flattenChanges } from '../utils/git-formatters.js';

const TOOL_NAME = 'git_add';
const TOOL_TITLE = 'Git Add';
const TOOL_DESCRIPTION =
  'Stage files for commit. Add file contents to the staging area (index) to prepare for the next commit.';

const InputSchema = z.object({
  path: PathSchema,
  files: z
    .array(z.string())
    .min(1)
    .describe(
      'Array of file paths to stage (relative to repository root). Use ["."] to stage all changes.',
    ),
  update: z
    .boolean()
    .default(false)
    .describe('Stage only modified and deleted files (skip untracked files).'),
  all: AllSchema,
  force: z
    .boolean()
    .default(false)
    .describe('Allow adding otherwise ignored files.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  stagedFiles: z
    .array(z.string())
    .describe('Files that were successfully staged.'),
  totalFiles: z.number().int().describe('Total number of files staged.'),
  status: z
    .object({
      current_branch: z
        .string()
        .nullable()
        .describe('Current branch name after staging.'),
      staged_changes: z
        .record(z.string(), z.any())
        .describe('All staged changes after this operation.'),
      unstaged_changes: z
        .record(z.string(), z.any())
        .describe('Remaining unstaged changes.'),
      untracked_files: z
        .array(z.string())
        .describe('Remaining untracked files.'),
      conflicted_files: z.array(z.string()).describe('Files with conflicts.'),
      is_clean: z
        .boolean()
        .describe('Whether working directory is clean (ready to commit).'),
    })
    .describe('Repository status after staging files.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitAddLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object using modern spread syntax
  const { path: _path, files, ...rest } = input;
  const addOptions = {
    paths: files,
    ...rest,
  };

  const result = await provider.add(addOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  // Get repository status after staging
  const statusResult = await provider.status(
    { includeUntracked: true },
    {
      workingDirectory: targetPath,
      requestContext: appContext,
      tenantId: appContext.tenantId || 'default-tenant',
    },
  );

  return {
    success: result.success,
    stagedFiles: result.stagedFiles,
    totalFiles: result.stagedFiles.length,
    status: {
      current_branch: statusResult.currentBranch,
      staged_changes: flattenChanges(statusResult.stagedChanges),
      unstaged_changes: flattenChanges(statusResult.unstagedChanges),
      untracked_files: statusResult.untrackedFiles,
      conflicted_files: statusResult.conflictedFiles,
      is_clean: statusResult.isClean,
    },
  };
}

/**
 * Filter git_add output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Just staged files and success
 * - standard: Above + basic repository status (RECOMMENDED)
 * - full: Complete output including detailed status breakdown
 */
function filterGitAddOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential staging information only
  if (level === 'minimal') {
    return {
      success: result.success,
      stagedFiles: result.stagedFiles,
      totalFiles: result.totalFiles,
    };
  }

  // standard: Above + complete repository status
  if (level === 'standard') {
    return {
      success: result.success,
      stagedFiles: result.stagedFiles,
      totalFiles: result.totalFiles,
      status: {
        current_branch: result.status.current_branch,
        is_clean: result.status.is_clean,
        // Include complete status with all file arrays (LLMs need full context)
        staged_changes: result.status.staged_changes,
        unstaged_changes: result.status.unstaged_changes,
        untracked_files: result.status.untracked_files,
        conflicted_files: result.status.conflicted_files,
      },
    };
  }

  // full: Complete output (no filtering)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitAddOutput,
});

export const gitAddTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitAddLogic)),
  responseFormatter,
};
