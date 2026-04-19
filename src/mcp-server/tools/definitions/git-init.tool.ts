/**
 * @fileoverview Git init tool - initialize a new repository
 * @module mcp-server/tools/definitions/git-init
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema } from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_init';
const TOOL_TITLE = 'Git Init';
const TOOL_DESCRIPTION =
  'Initialize a new Git repository at the specified path. Creates a .git directory and sets up the initial branch.';

const InputSchema = z.object({
  path: PathSchema,
  initialBranch: z
    .string()
    .optional()
    .describe('Name of the initial branch (default: main).'),
  bare: z
    .boolean()
    .default(false)
    .describe('Create a bare repository (no working directory).'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  path: z.string().describe('Path where repository was initialized.'),
  initialBranch: z.string().describe('Name of the initial branch.'),
  isBare: z.boolean().describe('Whether this is a bare repository.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitInitLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object with only defined properties to satisfy exactOptionalPropertyTypes
  const initOptions: {
    path: string;
    initialBranch?: string;
    bare?: boolean;
  } = {
    path: targetPath,
    bare: input.bare,
  };

  if (input.initialBranch !== undefined) {
    initOptions.initialBranch = input.initialBranch;
  }

  const result = await provider.init(initOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    path: result.path,
    initialBranch: result.initialBranch,
    isBare: result.bare,
  };
}

/**
 * Filter git_init output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and path only
 * - standard: Above + initial branch name (RECOMMENDED)
 * - full: Complete output including repository type
 */
function filterGitInitOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential initialization info only
  if (level === 'minimal') {
    return {
      success: result.success,
      path: result.path,
    };
  }

  // standard: Above + branch + bare flag.
  // isBare matters: bare repos reject commit/add, so the LLM needs to see it
  // before following up with staging or commit operations.
  if (level === 'standard') {
    return {
      success: result.success,
      path: result.path,
      initialBranch: result.initialBranch,
      isBare: result.isBare,
    };
  }

  // full: Complete output (no filtering)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitInitOutput,
});

export const gitInitTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitInitLogic)),
  responseFormatter,
};
