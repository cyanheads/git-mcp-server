/**
 * @fileoverview Git pull tool - fetch and integrate changes from remote
 * @module mcp-server/tools/definitions/git-pull
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  RemoteNameSchema,
  BranchNameSchema,
} from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_pull';
const TOOL_TITLE = 'Git Pull';
const TOOL_DESCRIPTION =
  'Pull changes from a remote repository. Fetches and integrates changes into the current branch. Use when the user wants to git pull.';

const InputSchema = z.object({
  path: PathSchema,
  remote: RemoteNameSchema.optional().describe(
    'Remote name (default: origin).',
  ),
  branch: BranchNameSchema.optional().describe(
    'Branch name (default: current branch).',
  ),
  rebase: z
    .boolean()
    .default(false)
    .describe('Use rebase instead of merge when integrating changes.'),
  fastForwardOnly: z
    .boolean()
    .default(false)
    .describe("Fail if can't fast-forward (no merge commit)."),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  remote: z.string().describe('Remote name that was pulled from.'),
  branch: z.string().describe('Branch that was pulled.'),
  strategy: z
    .enum(['merge', 'rebase', 'fast-forward'])
    .describe('Integration strategy used.'),
  conflicts: z.boolean().describe('Whether pull had conflicts.'),
  filesChanged: z.array(z.string()).describe('Files that were changed.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitPullLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const pullOptions: {
    remote?: string;
    branch?: string;
    rebase?: boolean;
    fastForwardOnly?: boolean;
  } = {};

  if (input.remote !== undefined) {
    pullOptions.remote = input.remote;
  }
  if (input.branch !== undefined) {
    pullOptions.branch = input.branch;
  }
  if (input.rebase !== undefined) {
    pullOptions.rebase = input.rebase;
  }
  if (input.fastForwardOnly !== undefined) {
    pullOptions.fastForwardOnly = input.fastForwardOnly;
  }

  const result = await provider.pull(pullOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    remote: result.remote,
    branch: result.branch,
    strategy: result.strategy,
    conflicts: result.conflicts,
    filesChanged: result.filesChanged,
  };
}

/**
 * Filter git_pull output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success, conflicts flag, remote, and branch only
 * - standard: Above + complete list of changed files (RECOMMENDED)
 * - full: Complete output
 */
function filterGitPullOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential info only
  if (level === 'minimal') {
    return {
      success: result.success,
      conflicts: result.conflicts,
      remote: result.remote,
      branch: result.branch,
      strategy: result.strategy,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all changed files)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitPullOutput,
});

export const gitPullTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitPullLogic)),
  responseFormatter,
};
