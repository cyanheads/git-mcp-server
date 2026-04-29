/**
 * @fileoverview Git rebase tool - rebase commits onto another branch
 * @module mcp-server/tools/definitions/git-rebase
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

const TOOL_NAME = 'git_rebase';
const TOOL_TITLE = 'Git Rebase';
const TOOL_DESCRIPTION =
  'Rebase commits onto another branch. Reapplies commits on top of another base tip for a cleaner history.';

const InputSchema = z
  .object({
    path: PathSchema,
    mode: z
      .enum(['start', 'continue', 'abort', 'skip'])
      .default('start')
      .describe(
        "Rebase operation mode: 'start', 'continue', 'abort', or 'skip'.",
      ),
    upstream: CommitRefSchema.optional().describe(
      'Upstream branch to rebase onto (required for start mode).',
    ),
    branch: CommitRefSchema.optional().describe(
      'Branch to rebase (default: current branch).',
    ),
    interactive: z
      .boolean()
      .default(false)
      .describe('Interactive rebase (not supported in all providers).'),
    onto: CommitRefSchema.optional().describe(
      'Rebase onto different commit than upstream.',
    ),
    preserve: z
      .boolean()
      .default(false)
      .describe('Preserve merge commits during rebase.'),
  })
  .strict();

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  conflicts: z.boolean().describe('Whether rebase had conflicts.'),
  conflictedFiles: z
    .array(z.string())
    .describe('Files with conflicts that need resolution.'),
  rebasedCommits: z
    .number()
    .int()
    .describe('Number of commits that were rebased.'),
  currentCommit: z
    .string()
    .optional()
    .describe('Current commit hash if rebase stopped due to conflict.'),
  message: z
    .string()
    .optional()
    .describe('Human-readable next-step guidance, especially for conflicts.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitRebaseLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const rebaseOptions: {
    mode?: 'start' | 'continue' | 'abort' | 'skip';
    upstream?: string;
    branch?: string;
    interactive?: boolean;
    onto?: string;
    preserve?: boolean;
  } = {};

  if (input.mode !== undefined) {
    rebaseOptions.mode = input.mode;
  }
  if (input.upstream !== undefined) {
    rebaseOptions.upstream = input.upstream;
  }
  if (input.branch !== undefined) {
    rebaseOptions.branch = input.branch;
  }
  if (input.interactive !== undefined) {
    rebaseOptions.interactive = input.interactive;
  }
  if (input.onto !== undefined) {
    rebaseOptions.onto = input.onto;
  }
  if (input.preserve !== undefined) {
    rebaseOptions.preserve = input.preserve;
  }

  const result = await provider.rebase(rebaseOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  const message = result.conflicts
    ? `Rebase paused with conflicts in ${result.conflictedFiles.length} file(s). Resolve them, then run git_rebase with mode='continue' (or mode='abort' to cancel, mode='skip' to drop the current commit).`
    : undefined;

  return {
    success: result.success,
    conflicts: result.conflicts,
    conflictedFiles: result.conflictedFiles,
    rebasedCommits: result.rebasedCommits,
    currentCommit: result.currentCommit,
    message,
  };
}

/**
 * Filter git_rebase output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success, conflicts flag, and rebased commits count only
 * - standard: Above + complete conflict file list and current commit (RECOMMENDED)
 * - full: Complete output
 */
function filterGitRebaseOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential status only
  if (level === 'minimal') {
    return {
      success: result.success,
      conflicts: result.conflicts,
      rebasedCommits: result.rebasedCommits,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all conflict files for resolution)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitRebaseOutput,
});

export const gitRebaseTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitRebaseLogic)),
  responseFormatter,
};
