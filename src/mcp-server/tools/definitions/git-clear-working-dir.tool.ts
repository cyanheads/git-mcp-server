/**
 * @fileoverview Git clear working directory tool - clear session working directory
 * @module mcp-server/tools/definitions/git-clear-working-dir
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_clear_working_dir';
const TOOL_TITLE = 'Git Clear Working Directory';
const TOOL_DESCRIPTION =
  'Clear the session working directory setting. This resets the context without restarting the server. Subsequent git operations will require an explicit path parameter unless git_set_working_dir is called again.';

const InputSchema = z
  .object({
    confirm: z
      .enum(['Y', 'y', 'Yes', 'yes'])
      .describe(
        "Explicit confirmation required to clear working directory. Accepted values: 'Y', 'y', 'Yes', or 'yes'.",
      ),
  })
  .strict();

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  message: z.string().describe('Confirmation message.'),
  previousPath: z
    .string()
    .optional()
    .describe('The working directory that was cleared (if one was set).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitClearWorkingDirLogic(
  _input: ToolInput,
  { storage, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Graceful degradation for tenantId
  const tenantId = appContext.tenantId || 'default-tenant';

  // Get the current working directory before clearing
  const storageKey = `session:workingDir:${tenantId}`;
  const previousPath = await storage.get<string>(storageKey, appContext);

  // Delete the working directory from session storage
  await storage.delete(storageKey, appContext);

  return {
    success: true,
    message: previousPath
      ? `Working directory cleared. Previous path was: ${previousPath}`
      : 'Working directory cleared. No previous path was set.',
    previousPath: previousPath || undefined,
  };
}

/**
 * Filter git_clear_working_dir output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and message only
 * - standard: Above + previous path (RECOMMENDED)
 * - full: Complete output (same as standard)
 */
function filterGitClearWorkingDirOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential status only
  if (level === 'minimal') {
    return {
      success: result.success,
      message: result.message,
    };
  }

  // standard & full: Complete output with previous path
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitClearWorkingDirOutput,
});

export const gitClearWorkingDirTool: ToolDefinition<
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
    createToolHandler(gitClearWorkingDirLogic, { skipPathResolution: true }),
  ),
  responseFormatter,
};
