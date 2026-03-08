/**
 * @fileoverview Git worktree tool - manage multiple working trees
 * @module mcp-server/tools/definitions/git-worktree
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  BranchNameSchema,
  CommitRefSchema,
} from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_worktree';
const TOOL_TITLE = 'Git Worktree';
const TOOL_DESCRIPTION =
  'Manage multiple working trees: list worktrees, add new worktrees for parallel work, remove worktrees, or move worktrees to new locations. Use when the user wants to git worktree.';

const InputSchema = z.object({
  path: PathSchema,
  mode: z
    .enum(['list', 'add', 'remove', 'move', 'prune'])
    .default('list')
    .describe('The worktree operation to perform.'),
  worktreePath: z
    .string()
    .optional()
    .describe('Path for the new worktree (for add/move operations).'),
  branch: BranchNameSchema.optional().describe(
    'Branch to checkout in the new worktree (for add operation).',
  ),
  commitish: CommitRefSchema.optional().describe(
    'Commit/branch to base the worktree on (for add operation).',
  ),
  force: z
    .boolean()
    .default(false)
    .describe(
      'Force operation (for remove operation with uncommitted changes).',
    ),
  newPath: z
    .string()
    .optional()
    .describe('New path for the worktree (for move operation).'),
  detach: z
    .boolean()
    .default(false)
    .describe('Create worktree with detached HEAD (for add operation).'),
  verbose: z
    .boolean()
    .default(false)
    .describe('Provide detailed output for worktree operations.'),
  dryRun: z
    .boolean()
    .default(false)
    .describe(
      'Preview the operation without executing it (for prune operation).',
    ),
});

const WorktreeInfoSchema = z.object({
  path: z.string().describe('Absolute path to the worktree.'),
  head: z.string().describe('HEAD commit hash in this worktree.'),
  branch: z
    .string()
    .optional()
    .describe('Branch checked out (if not detached).'),
  bare: z.boolean().describe('Whether worktree is bare.'),
  detached: z.boolean().describe('Whether HEAD is detached.'),
  locked: z.boolean().describe('Whether the worktree is locked.'),
  prunable: z.boolean().describe('Whether the worktree can be pruned.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mode: z.string().describe('Operation mode that was performed.'),
  worktrees: z
    .array(WorktreeInfoSchema)
    .optional()
    .describe('List of worktrees (for list mode).'),
  added: z.string().optional().describe('Added worktree path (for add mode).'),
  removed: z
    .string()
    .optional()
    .describe('Removed worktree path (for remove mode).'),
  moved: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional()
    .describe('Move operation info (for move mode).'),
  pruned: z
    .array(z.string())
    .optional()
    .describe('Pruned worktree paths (for prune mode).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitWorktreeLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const worktreeOptions: {
    mode: 'list' | 'add' | 'remove' | 'move' | 'prune';
    path?: string;
    branch?: string;
    commitish?: string;
    force?: boolean;
    newPath?: string;
    detach?: boolean;
    verbose?: boolean;
    dryRun?: boolean;
  } = {
    mode: input.mode,
  };

  if (input.worktreePath !== undefined) {
    worktreeOptions.path = input.worktreePath;
  }
  if (input.branch !== undefined) {
    worktreeOptions.branch = input.branch;
  }
  if (input.commitish !== undefined) {
    worktreeOptions.commitish = input.commitish;
  }
  if (input.force !== undefined) {
    worktreeOptions.force = input.force;
  }
  if (input.newPath !== undefined) {
    worktreeOptions.newPath = input.newPath;
  }
  if (input.detach !== undefined) {
    worktreeOptions.detach = input.detach;
  }
  if (input.verbose !== undefined) {
    worktreeOptions.verbose = input.verbose;
  }
  if (input.dryRun !== undefined) {
    worktreeOptions.dryRun = input.dryRun;
  }

  const result = await provider.worktree(worktreeOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    mode: result.mode,
    worktrees: result.worktrees,
    added: result.added,
    removed: result.removed,
    moved: result.moved,
    pruned: result.pruned,
  };
}

/**
 * Filter git_worktree output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and mode only
 * - standard: Above + complete worktrees array (for list) or operation results (RECOMMENDED)
 * - full: Complete output
 */
function filterGitWorktreeOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential info only
  if (level === 'minimal') {
    return {
      success: result.success,
      mode: result.mode,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all worktrees or operation results)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitWorktreeOutput,
});

export const gitWorktreeTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitWorktreeLogic)),
  responseFormatter,
};
