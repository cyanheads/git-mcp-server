/**
 * @fileoverview Git reset tool - reset current HEAD to specified state
 * @module mcp-server/tools/definitions/git-reset
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, CommitRefSchema } from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';
import { validateProtectedBranchOperation } from '../utils/git-validators.js';

const TOOL_NAME = 'git_reset';
const TOOL_TITLE = 'Git Reset';
const TOOL_DESCRIPTION =
  'Reset current HEAD to specified state. Can be used to unstage files (soft), discard commits (mixed), or discard all changes (hard).';

const InputSchema = z
  .object({
    path: PathSchema,
    mode: z
      .enum(['soft', 'mixed', 'hard', 'merge', 'keep'])
      .default('mixed')
      .describe(
        'Reset mode: soft (keep changes staged), mixed (unstage changes), hard (discard all changes), merge (reset and merge), keep (reset but keep local changes).',
      ),
    target: CommitRefSchema.default('HEAD').describe(
      'Target commit to reset to. Defaults to HEAD.',
    ),
    paths: z
      .array(z.string())
      .optional()
      .describe('Specific file paths to reset (leaves HEAD unchanged).'),
    confirmed: z
      .boolean()
      .default(false)
      .describe(
        'Explicit confirmation required for hard, merge, and keep reset modes on protected branches (main, master, production, etc.).',
      ),
  })
  .strict();

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mode: z.string().describe('Reset mode that was used.'),
  target: z.string().describe('Commit hash HEAD points to after the reset.'),
  previousCommit: z
    .string()
    .optional()
    .describe(
      'Commit hash HEAD pointed to before the reset (omitted if HEAD did not move).',
    ),
  filesReset: z
    .array(z.string())
    .describe(
      'Files affected by the reset. For path-only resets, the listed paths. For commit-move resets, files that differ between the old and new HEAD. For --hard with no HEAD move, files whose pending working-tree changes were discarded.',
    ),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitResetLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Enforce protected branch checks for destructive reset modes
  if (
    input.mode === 'hard' ||
    input.mode === 'merge' ||
    input.mode === 'keep'
  ) {
    const status = await provider.status(
      { includeUntracked: false },
      {
        workingDirectory: targetPath,
        requestContext: appContext,
        tenantId: appContext.tenantId || 'default-tenant',
      },
    );
    if (status?.currentBranch) {
      validateProtectedBranchOperation(
        status.currentBranch,
        `reset --${input.mode}`,
        input.confirmed,
      );
    }
  }

  const resetOptions: {
    mode: 'soft' | 'mixed' | 'hard' | 'merge' | 'keep';
    commit: string;
    paths?: string[];
  } = {
    mode: input.mode,
    commit: input.target,
  };

  if (input.paths !== undefined) {
    resetOptions.paths = input.paths;
  }

  const result = await provider.reset(resetOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  const output: ToolOutput = {
    success: result.success,
    mode: result.mode,
    target: result.commit,
    filesReset: result.filesReset,
  };
  if (result.previousCommit !== undefined) {
    output.previousCommit = result.previousCommit;
  }
  return output;
}

/**
 * Filter git_reset output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success, mode, and target only
 * - standard: Above + complete list of reset files (RECOMMENDED)
 * - full: Complete output
 */
function filterGitResetOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential info only
  if (level === 'minimal') {
    const minimal: Partial<ToolOutput> = {
      success: result.success,
      mode: result.mode,
      target: result.target,
    };
    if (result.previousCommit !== undefined) {
      minimal.previousCommit = result.previousCommit;
    }
    return minimal;
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all reset files)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitResetOutput,
});

export const gitResetTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitResetLogic)),
  responseFormatter,
};
