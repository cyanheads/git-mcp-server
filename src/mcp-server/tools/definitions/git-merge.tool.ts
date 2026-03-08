/**
 * @fileoverview Git merge tool - merge branches
 * @module mcp-server/tools/definitions/git-merge
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  BranchNameSchema,
  MergeStrategySchema,
  CommitMessageSchema,
} from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_merge';
const TOOL_TITLE = 'Git Merge';
const TOOL_DESCRIPTION =
  'Merge branches together. Integrates changes from another branch into the current branch with optional merge strategies. Use when the user wants to git merge.';

const InputSchema = z.object({
  path: PathSchema,
  branch: BranchNameSchema.describe('Branch to merge into current branch.'),
  strategy: MergeStrategySchema,
  noFastForward: z
    .boolean()
    .default(false)
    .describe('Prevent fast-forward merge (create merge commit).'),
  squash: z
    .boolean()
    .default(false)
    .describe('Squash all commits from the branch into a single commit.'),
  message: CommitMessageSchema.optional().describe(
    'Custom merge commit message.',
  ),
  abort: z
    .boolean()
    .default(false)
    .describe('Abort an in-progress merge that has conflicts.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  strategy: z.string().describe('Merge strategy used.'),
  fastForward: z.boolean().describe('Whether merge was fast-forward.'),
  conflicts: z.boolean().describe('Whether merge had conflicts.'),
  conflictedFiles: z
    .array(z.string())
    .describe('Files with conflicts that need resolution.'),
  mergedFiles: z.array(z.string()).describe('Files that were merged.'),
  message: z.string().describe('Merge commit message.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitMergeLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const mergeOptions: {
    branch: string;
    strategy?: 'ort' | 'recursive' | 'octopus' | 'ours' | 'subtree';
    noFastForward?: boolean;
    squash?: boolean;
    message?: string;
    abort?: boolean;
  } = {
    branch: input.branch,
  };

  if (input.strategy !== undefined) {
    mergeOptions.strategy = input.strategy;
  }
  if (input.noFastForward !== undefined) {
    mergeOptions.noFastForward = input.noFastForward;
  }
  if (input.squash !== undefined) {
    mergeOptions.squash = input.squash;
  }
  if (input.message !== undefined) {
    mergeOptions.message = input.message;
  }
  if (input.abort !== undefined) {
    mergeOptions.abort = input.abort;
  }

  const result = await provider.merge(mergeOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    strategy: result.strategy,
    fastForward: result.fastForward,
    conflicts: result.conflicts,
    conflictedFiles: result.conflictedFiles,
    mergedFiles: result.mergedFiles,
    message: result.message,
  };
}

/**
 * Filter git_merge output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success, conflicts flag, and strategy only
 * - standard: Above + complete conflict and merged file lists (RECOMMENDED)
 * - full: Complete output
 */
function filterGitMergeOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential status only
  if (level === 'minimal') {
    return {
      success: result.success,
      conflicts: result.conflicts,
      strategy: result.strategy,
      fastForward: result.fastForward,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all file lists for conflict resolution)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitMergeOutput,
});

export const gitMergeTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitMergeLogic)),
  responseFormatter,
};
