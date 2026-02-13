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

const InputSchema = z.object({
  path: PathSchema,
  mode: z
    .enum(['soft', 'mixed', 'hard', 'merge', 'keep'])
    .default('mixed')
    .describe(
      'Reset mode: soft (keep changes staged), mixed (unstage changes), hard (discard all changes), merge (reset and merge), keep (reset but keep local changes).',
    ),
  target: CommitRefSchema.optional().describe(
    'Target commit to reset to (default: HEAD).',
  ),
  paths: z
    .array(z.string())
    .optional()
    .describe('Specific file paths to reset (leaves HEAD unchanged).'),
  confirmed: z
    .boolean()
    .default(false)
    .describe(
      'Explicit confirmation required for hard reset on protected branches (main, master, production, etc.).',
    ),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mode: z.string().describe('Reset mode that was used.'),
  target: z.string().describe('Target commit that was reset to.'),
  filesReset: z
    .array(z.string())
    .describe('Files that were affected by the reset.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitResetLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Enforce protected branch checks for destructive reset modes
  if (input.mode === 'hard') {
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
        'reset --hard',
        input.confirmed,
      );
    }
  }

  const resetOptions: {
    mode: 'soft' | 'mixed' | 'hard' | 'merge' | 'keep';
    commit?: string;
    paths?: string[];
  } = {
    mode: input.mode,
  };

  if (input.target !== undefined) {
    resetOptions.commit = input.target;
  }
  if (input.paths !== undefined) {
    resetOptions.paths = input.paths;
  }

  const result = await provider.reset(resetOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    mode: result.mode,
    target: result.commit,
    filesReset: result.filesReset,
  };
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
    return {
      success: result.success,
      mode: result.mode,
      target: result.target,
    };
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
