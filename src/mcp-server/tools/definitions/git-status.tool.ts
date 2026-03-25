/**
 * @fileoverview Git status tool - show working tree status
 * @module mcp-server/tools/definitions/git-status
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema } from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_status';
const TOOL_TITLE = 'Git Status';
const TOOL_DESCRIPTION =
  'Show the working tree status including staged, unstaged, and untracked files.';

const InputSchema = z.object({
  path: PathSchema,
  includeUntracked: z
    .boolean()
    .default(true)
    .describe('Include untracked files in the output.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  currentBranch: z.string().nullable().describe('Current branch name.'),
  isClean: z
    .boolean()
    .describe(
      'True if working directory is clean (no staged, unstaged, or untracked changes). When includeUntracked is false, untracked files are excluded from this check.',
    ),
  stagedChanges: z
    .object({
      added: z
        .array(z.string())
        .optional()
        .describe('Files added to the index (staged).'),
      modified: z
        .array(z.string())
        .optional()
        .describe('Files modified and staged.'),
      deleted: z
        .array(z.string())
        .optional()
        .describe('Files deleted and staged.'),
      renamed: z
        .array(z.string())
        .optional()
        .describe('Files renamed and staged.'),
      copied: z
        .array(z.string())
        .optional()
        .describe('Files copied and staged.'),
    })
    .describe('Changes that have been staged for the next commit.'),
  unstagedChanges: z
    .object({
      added: z
        .array(z.string())
        .optional()
        .describe('Files added but not staged.'),
      modified: z
        .array(z.string())
        .optional()
        .describe('Files modified but not staged.'),
      deleted: z
        .array(z.string())
        .optional()
        .describe('Files deleted but not staged.'),
    })
    .describe('Changes in the working directory that have not been staged.'),
  untrackedFiles: z
    .array(z.string())
    .describe('Files in the working directory not tracked by git.'),
  conflictedFiles: z
    .array(z.string())
    .describe('Files with merge conflicts that need resolution.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitStatusLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Call provider's status method
  const result = await provider.status(
    {
      includeUntracked: input.includeUntracked,
    },
    {
      workingDirectory: targetPath,
      requestContext: appContext,
      tenantId: appContext.tenantId || 'default-tenant',
    },
  );

  return {
    success: true,
    currentBranch: result.currentBranch,
    isClean: result.isClean,
    stagedChanges: result.stagedChanges,
    unstagedChanges: result.unstagedChanges,
    untrackedFiles: result.untrackedFiles,
    conflictedFiles: result.conflictedFiles,
  };
}

/**
 * Filter git_status output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Branch and clean status only
 * - standard: Above + complete status details (RECOMMENDED)
 * - full: Complete output
 */
function filterGitStatusOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential summary only
  if (level === 'minimal') {
    return {
      success: result.success,
      currentBranch: result.currentBranch,
      isClean: result.isClean,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all file lists)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitStatusOutput,
});

export const gitStatusTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], createToolHandler(gitStatusLogic)),
  responseFormatter,
};
