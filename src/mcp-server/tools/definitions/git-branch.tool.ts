/**
 * @fileoverview Git branch tool - manage branches
 * @module mcp-server/tools/definitions/git-branch
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  AllSchema,
  BranchNameSchema,
  CommitRefSchema,
  ForceSchema,
  PathSchema,
} from '../schemas/common.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_branch';
const TOOL_TITLE = 'Git Branch';
const TOOL_DESCRIPTION =
  'Manage branches: list all branches, show current branch, create a new branch, delete a branch, or rename a branch. Use when the user wants to git branch.';

const InputSchema = z.object({
  path: PathSchema,
  operation: z
    .enum(['list', 'create', 'delete', 'rename', 'show-current'])
    .default('list')
    .describe('The branch operation to perform.'),
  name: BranchNameSchema.optional().describe(
    'Branch name for create/delete/rename operations.',
  ),
  newName: BranchNameSchema.optional().describe(
    'New branch name for rename operation.',
  ),
  startPoint: CommitRefSchema.optional().describe(
    'Starting point (commit/branch) for new branch creation.',
  ),
  force: ForceSchema,
  all: AllSchema.describe(
    'For list operation: show both local and remote branches.',
  ),
  remote: z
    .boolean()
    .default(false)
    .describe('For list operation: show only remote branches.'),
  merged: z
    .union([z.boolean(), CommitRefSchema])
    .optional()
    .describe(
      'For list operation: show only branches merged into HEAD (true) or specified commit (string).',
    ),
  noMerged: z
    .union([z.boolean(), CommitRefSchema])
    .optional()
    .describe(
      'For list operation: show only branches not merged into HEAD (true) or specified commit (string).',
    ),
});

const BranchInfoSchema = z.object({
  name: z.string().describe('Branch name.'),
  current: z.boolean().describe('True if this is the current branch.'),
  commitHash: z.string().describe('Commit hash the branch points to.'),
  upstream: z
    .string()
    .optional()
    .describe('Upstream branch name if configured.'),
  ahead: z.number().int().optional().describe('Commits ahead of upstream.'),
  behind: z.number().int().optional().describe('Commits behind upstream.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  operation: z.enum(['list', 'create', 'delete', 'rename', 'show-current']),
  branches: z
    .array(BranchInfoSchema)
    .optional()
    .describe('List of branches (for list operation).'),
  currentBranch: z.string().optional().describe('Name of current branch.'),
  message: z
    .string()
    .optional()
    .describe('Success message for create/delete/rename operations.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitBranchLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Handle show-current operation separately (lightweight, no need for full branch call)
  if (input.operation === 'show-current') {
    const result = await provider.branch(
      { mode: 'list' },
      {
        workingDirectory: targetPath,
        requestContext: appContext,
        tenantId: appContext.tenantId || 'default-tenant',
      },
    );

    const current =
      result.mode === 'list'
        ? result.branches.find((b) => b.current)
        : undefined;
    return {
      success: true,
      operation: 'show-current',
      branches: undefined,
      currentBranch: current?.name,
      message: current
        ? `Current branch: ${current.name}`
        : 'Not on any branch (detached HEAD)',
    };
  }

  // Build options object with only defined properties
  const { path: _path, operation, name, newName, ...rest } = input;

  const branchOptions: {
    mode: 'list' | 'create' | 'delete' | 'rename';
    branchName?: string;
    newBranchName?: string;
    startPoint?: string;
    force?: boolean;
    remote?: boolean;
    all?: boolean;
    merged?: boolean | string;
    noMerged?: boolean | string;
  } = {
    mode: operation,
  };

  if (name !== undefined) {
    branchOptions.branchName = name;
  }
  if (newName !== undefined) {
    branchOptions.newBranchName = newName;
  }
  if (rest.startPoint !== undefined) {
    branchOptions.startPoint = rest.startPoint;
  }
  if (rest.force !== undefined) {
    branchOptions.force = rest.force;
  }
  if (rest.all) {
    branchOptions.all = true;
  } else if (rest.remote) {
    branchOptions.remote = true;
  }
  if (rest.merged !== undefined) {
    branchOptions.merged = rest.merged;
  }
  if (rest.noMerged !== undefined) {
    branchOptions.noMerged = rest.noMerged;
  }

  const result = await provider.branch(branchOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  // Handle discriminated union result
  if (result.mode === 'list') {
    return {
      success: true,
      operation: 'list',
      branches: result.branches,
      currentBranch: result.branches.find((b) => b.current)?.name,
      message: undefined,
    };
  } else if (result.mode === 'create') {
    return {
      success: true,
      operation: 'create',
      branches: undefined,
      currentBranch: undefined,
      message: `Branch '${result.created}' created successfully.`,
    };
  } else if (result.mode === 'delete') {
    return {
      success: true,
      operation: 'delete',
      branches: undefined,
      currentBranch: undefined,
      message: `Branch '${result.deleted}' deleted successfully.`,
    };
  } else {
    // rename
    return {
      success: true,
      operation: 'rename',
      branches: undefined,
      currentBranch: undefined,
      message: `Branch '${result.renamed.from}' renamed to '${result.renamed.to}'.`,
    };
  }
}

/**
 * Filter git_branch output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success, operation, and current branch name only
 * - standard: Above + complete branches array (for list) or message (for other ops) (RECOMMENDED)
 * - full: Complete output
 */
function filterGitBranchOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential info only
  if (level === 'minimal') {
    return {
      success: result.success,
      operation: result.operation,
      currentBranch: result.currentBranch,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all branches or full message)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitBranchOutput,
});

export const gitBranchTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitBranchLogic)),
  responseFormatter,
};
