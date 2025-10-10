/**
 * @fileoverview Git branch tool - manage branches
 * @module mcp-server/tools/definitions/git-branch
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
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

const TOOL_NAME = 'git_branch';
const TOOL_TITLE = 'Git Branch';
const TOOL_DESCRIPTION =
  'Manage branches: list all branches, show current branch, create a new branch, delete a branch, or rename a branch.';

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
    .boolean()
    .optional()
    .describe('For list operation: show only branches merged into HEAD.'),
  noMerged: z
    .boolean()
    .optional()
    .describe('For list operation: show only branches not merged into HEAD.'),
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

    if (result.mode === 'list') {
      const current = result.branches.find((b) => b.current);
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
  }

  // Build options object with only defined properties
  const {
    path: _path,
    operation,
    name,
    newName,
    merged: _merged,
    noMerged: _noMerged,
    ...rest
  } = input;

  const branchOptions: {
    mode: 'list' | 'create' | 'delete' | 'rename';
    branchName?: string;
    newBranchName?: string;
    startPoint?: string;
    force?: boolean;
    remote?: boolean;
  } = {
    mode: operation as 'list' | 'create' | 'delete' | 'rename',
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
  if (rest.all !== undefined || rest.remote !== undefined) {
    branchOptions.remote = rest.remote || rest.all;
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

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const header = `# Git Branch - ${result.operation.charAt(0).toUpperCase() + result.operation.slice(1).replace('-', ' ')}\n\n`;

  if (result.operation === 'list' && result.branches) {
    const current = result.branches.find((b) => b.current);
    const currentInfo = current
      ? `**Current Branch:** ${current.name}\n\n`
      : '';

    const branchList = result.branches
      .map((branch) => {
        const marker = branch.current ? '* ' : '  ';
        const upstreamInfo = branch.upstream ? ` → ${branch.upstream}` : '';
        const trackingInfo =
          branch.ahead || branch.behind
            ? ` [ahead ${branch.ahead || 0}, behind ${branch.behind || 0}]`
            : '';
        return `${marker}${branch.name}${upstreamInfo}${trackingInfo} (${branch.commitHash.substring(0, 7)})`;
      })
      .join('\n');

    return [
      {
        type: 'text',
        text: `${header}${currentInfo}## Branches (${result.branches.length})\n\`\`\`\n${branchList}\n\`\`\``,
      },
    ];
  }

  const message = result.message || 'Operation completed successfully.';
  return [{ type: 'text', text: `${header}${message}` }];
}

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
