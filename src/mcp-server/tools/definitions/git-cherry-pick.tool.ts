/**
 * @fileoverview Git cherry-pick tool - apply commits from other branches
 * @module mcp-server/tools/definitions/git-cherry-pick
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  CommitRefSchema,
  MergeStrategySchema,
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

const TOOL_NAME = 'git_cherry_pick';
const TOOL_TITLE = 'Git Cherry-Pick';
const TOOL_DESCRIPTION =
  'Cherry-pick commits from other branches. Apply specific commits to the current branch without merging entire branches.';

const InputSchema = z.object({
  path: PathSchema,
  commits: z
    .array(CommitRefSchema)
    .min(1)
    .describe('Commit hashes to cherry-pick.'),
  noCommit: z
    .boolean()
    .default(false)
    .describe("Don't create commit (stage changes only)."),
  continueOperation: z
    .boolean()
    .default(false)
    .describe('Continue cherry-pick after resolving conflicts.'),
  abort: z.boolean().default(false).describe('Abort cherry-pick operation.'),
  mainline: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'For merge commits, specify which parent to follow (1 for first parent, 2 for second, etc.).',
    ),
  strategy: MergeStrategySchema.describe(
    'Merge strategy to use for cherry-pick.',
  ),
  signoff: z
    .boolean()
    .default(false)
    .describe('Add Signed-off-by line to the commit message.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  pickedCommits: z
    .array(z.string())
    .describe('Commits that were successfully cherry-picked.'),
  conflicts: z.boolean().describe('Whether operation had conflicts.'),
  conflictedFiles: z
    .array(z.string())
    .describe('Files with conflicts that need resolution.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitCherryPickLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object with only defined properties
  const cherryPickOptions: {
    commits: string[];
    noCommit?: boolean;
    continueOperation?: boolean;
    abort?: boolean;
    mainline?: number;
    strategy?: 'ort' | 'recursive' | 'octopus' | 'ours' | 'subtree';
    signoff?: boolean;
  } = {
    commits: input.commits,
    noCommit: input.noCommit,
    continueOperation: input.continueOperation,
    abort: input.abort,
    signoff: input.signoff,
  };

  if (input.mainline !== undefined) {
    cherryPickOptions.mainline = input.mainline;
  }
  if (input.strategy !== undefined) {
    cherryPickOptions.strategy = input.strategy;
  }

  const result = await provider.cherryPick(cherryPickOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    pickedCommits: result.pickedCommits,
    conflicts: result.conflicts,
    conflictedFiles: result.conflictedFiles,
  };
}

/**
 * Filter git_cherry_pick output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success, conflicts flag, and picked commit count only
 * - standard: Above + complete lists of picked commits and conflicted files (RECOMMENDED)
 * - full: Complete output
 */
function filterGitCherryPickOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential status only
  if (level === 'minimal') {
    return {
      success: result.success,
      conflicts: result.conflicts,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all picked commits and conflicts)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitCherryPickOutput,
});

export const gitCherryPickTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(
    ['tool:git:write'],
    createToolHandler(gitCherryPickLogic),
  ),
  responseFormatter,
};
