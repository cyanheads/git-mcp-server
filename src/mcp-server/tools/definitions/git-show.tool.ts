/**
 * @fileoverview Git show tool - inspect git objects
 * @module mcp-server/tools/definitions/git-show
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

const TOOL_NAME = 'git_show';
const TOOL_TITLE = 'Git Show';
const TOOL_DESCRIPTION =
  'Show details of a git object (commit, tree, blob, or tag). Displays commit information and the diff of changes introduced.';

const InputSchema = z.object({
  path: PathSchema,
  object: CommitRefSchema.describe(
    'Git object to show (commit hash, branch, tag, tree, or blob).',
  ),
  format: z
    .enum(['raw', 'json'])
    .optional()
    .describe('Output format for the git object.'),
  stat: z
    .boolean()
    .default(false)
    .describe('Show diffstat instead of full diff.'),
  filePath: z
    .string()
    .optional()
    .describe(
      'View specific file at a given commit reference. When provided, shows the file content from the specified object.',
    ),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  object: z.string().describe('Object identifier.'),
  type: z
    .enum(['commit', 'tag', 'tree', 'blob'])
    .describe('Type of git object shown.'),
  content: z.string().describe('Formatted output showing the object details.'),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Additional metadata about the object.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitShowLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object with only defined properties
  const showOptions: {
    object: string;
    format?: 'raw' | 'json';
    stat?: boolean;
    filePath?: string;
  } = {
    object: input.object,
  };

  if (input.format !== undefined) {
    showOptions.format = input.format;
  }
  if (input.stat !== undefined) {
    showOptions.stat = input.stat;
  }
  if (input.filePath !== undefined) {
    showOptions.filePath = input.filePath;
  }

  const result = await provider.show(showOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    object: result.object,
    type: result.type,
    content: result.content,
    metadata: result.metadata,
  };
}

/**
 * Filter git_show output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Object reference and type only
 * - standard: Above + metadata (RECOMMENDED)
 * - full: Complete output including content (may be large for diffs)
 */
function filterGitShowOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential identification only
  if (level === 'minimal') {
    return {
      success: result.success,
      object: result.object,
      type: result.type,
    };
  }

  // standard: Above + metadata
  if (level === 'standard') {
    return {
      success: result.success,
      object: result.object,
      type: result.type,
      metadata: result.metadata,
    };
  }

  // full: Complete output including content
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitShowOutput,
});

export const gitShowTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], createToolHandler(gitShowLogic)),
  responseFormatter,
};
