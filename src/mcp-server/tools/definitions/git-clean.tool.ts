/**
 * @fileoverview Git clean tool - remove untracked files
 * @module mcp-server/tools/definitions/git-clean
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, ForceSchema, DryRunSchema } from '../schemas/common.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_clean';
const TOOL_TITLE = 'Git Clean';
const TOOL_DESCRIPTION =
  'Remove untracked files from the working directory. Requires force flag for safety. Use dry-run to preview files that would be removed. Use when the user wants to git clean.';

const InputSchema = z.object({
  path: PathSchema,
  force: ForceSchema.refine((val) => val === true, {
    message: 'force flag must be set to true to clean untracked files',
  }),
  dryRun: DryRunSchema,
  directories: z
    .boolean()
    .default(false)
    .describe('Remove untracked directories in addition to files.'),
  ignored: z.boolean().default(false).describe('Remove ignored files as well.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  filesRemoved: z
    .array(z.string())
    .describe('List of files that were removed.'),
  directoriesRemoved: z
    .array(z.string())
    .describe('List of directories that were removed.'),
  dryRun: z.boolean().describe('Whether this was a dry-run (preview only).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitCleanLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object using modern spread syntax
  const { path: _path, ...rest } = input;
  const cleanOptions = {
    ...rest,
  };

  const result = await provider.clean(cleanOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    filesRemoved: result.filesRemoved,
    directoriesRemoved: result.directoriesRemoved,
    dryRun: result.dryRun,
  };
}

/**
 * Filter git_clean output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and dry-run flag only
 * - standard: Above + complete lists of removed files/directories (RECOMMENDED)
 * - full: Complete output (same as standard)
 */
function filterGitCleanOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential status only
  if (level === 'minimal') {
    return {
      success: result.success,
      dryRun: result.dryRun,
    };
  }

  // standard & full: Complete output with all file lists
  // (LLMs need complete context - include all removed items)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitCleanOutput,
});

export const gitCleanTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitCleanLogic)),
  responseFormatter,
};
