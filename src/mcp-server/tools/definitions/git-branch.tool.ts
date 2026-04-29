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
  LimitSchema,
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
  'Manage branches: list all branches, show current branch, create a new branch, delete a branch, or rename a branch.';

const InputSchema = z
  .object({
    path: PathSchema,
    mode: z
      .enum(['list', 'create', 'delete', 'rename', 'show-current'])
      .default('list')
      .describe('The branch operation to perform.'),
    branchName: BranchNameSchema.optional().describe(
      'Branch name for create/delete/rename operations.',
    ),
    newBranchName: BranchNameSchema.optional().describe(
      'New branch name for rename operation.',
    ),
    startPoint: CommitRefSchema.optional().describe(
      'Starting point (commit/branch) for new branch creation.',
    ),
    force: ForceSchema,
    all: AllSchema.describe(
      'For list mode: show both local and remote branches.',
    ),
    remote: z
      .boolean()
      .default(false)
      .describe('For list mode: show only remote branches.'),
    merged: z
      .preprocess(
        (val) => (val === 'true' ? true : val === 'false' ? false : val),
        z.union([z.boolean(), CommitRefSchema]),
      )
      .optional()
      .describe(
        'For list mode: show only branches merged into HEAD (true) or specified commit (string).',
      ),
    noMerged: z
      .preprocess(
        (val) => (val === 'true' ? true : val === 'false' ? false : val),
        z.union([z.boolean(), CommitRefSchema]),
      )
      .optional()
      .describe(
        'For list mode: show only branches not merged into HEAD (true) or specified commit (string).',
      ),
    limit: LimitSchema.describe(
      'For list mode: cap the number of branches returned (applied at the git command). Use on repos with many branches.',
    ),
  })
  .strict();

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
  mode: z.enum(['list', 'create', 'delete', 'rename', 'show-current']),
  branches: z
    .array(BranchInfoSchema)
    .optional()
    .describe('List of branches (for list mode).'),
  currentBranch: z.string().optional().describe('Name of current branch.'),
  message: z
    .string()
    .optional()
    .describe('Success message for create/delete/rename modes.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitBranchLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  if (input.mode === 'show-current') {
    const result = await provider.branch(
      { mode: 'show-current' },
      {
        workingDirectory: targetPath,
        requestContext: appContext,
        tenantId: appContext.tenantId || 'default-tenant',
      },
    );

    const current = result.mode === 'show-current' ? result.current : null;
    return {
      success: true,
      mode: 'show-current',
      branches: undefined,
      currentBranch: current ?? undefined,
      message: current
        ? `Current branch: ${current}`
        : 'Not on any branch (detached HEAD)',
    };
  }

  const { path: _path, mode, branchName, newBranchName, ...rest } = input;

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
    limit?: number;
  } = {
    mode,
  };

  if (branchName !== undefined) {
    branchOptions.branchName = branchName;
  }
  if (newBranchName !== undefined) {
    branchOptions.newBranchName = newBranchName;
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
  if (rest.limit !== undefined) {
    branchOptions.limit = rest.limit;
  }

  const result = await provider.branch(branchOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  if (result.mode === 'list') {
    return {
      success: true,
      mode: 'list',
      branches: result.branches,
      currentBranch: result.branches.find((b) => b.current)?.name,
      message: undefined,
    };
  } else if (result.mode === 'create') {
    return {
      success: true,
      mode: 'create',
      branches: undefined,
      currentBranch: undefined,
      message: `Branch '${result.created}' created successfully.`,
    };
  } else if (result.mode === 'delete') {
    return {
      success: true,
      mode: 'delete',
      branches: undefined,
      currentBranch: undefined,
      message: `Branch '${result.deleted}' deleted successfully.`,
    };
  } else if (result.mode === 'rename') {
    return {
      success: true,
      mode: 'rename',
      branches: undefined,
      currentBranch: undefined,
      message: `Branch '${result.renamed.from}' renamed to '${result.renamed.to}'.`,
    };
  }

  // Unreachable: show-current is handled in the early-return above.
  throw new Error(`Unexpected branch result mode: ${result.mode}`);
}

function filterGitBranchOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  if (level === 'minimal') {
    return {
      success: result.success,
      mode: result.mode,
      currentBranch: result.currentBranch,
    };
  }
  return result;
}

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
