/**
 * @fileoverview Git reflog tool - view reference logs
 * @module mcp-server/tools/definitions/git-reflog
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, LimitSchema } from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_reflog';
const TOOL_TITLE = 'Git Reflog';
const TOOL_DESCRIPTION =
  'View the reference logs (reflog) to track when branch tips and other references were updated. Useful for recovering lost commits. Use when the user wants to review history or past activity.';

const InputSchema = z.object({
  path: PathSchema,
  ref: z
    .string()
    .optional()
    .describe('Show reflog for specific reference (default: HEAD).'),
  maxCount: LimitSchema.default(25),
});

const ReflogEntrySchema = z.object({
  hash: z.string().describe('Commit hash for this reflog entry.'),
  refName: z.string().describe('Reference name (e.g., HEAD@{0}, main@{1}).'),
  action: z
    .string()
    .describe('Action that caused this reflog entry (commit, checkout, etc.).'),
  message: z.string().describe('Detailed message describing the action.'),
  timestamp: z
    .number()
    .int()
    .describe('Unix timestamp when this action occurred.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  ref: z.string().describe('The reference that was queried.'),
  entries: z
    .array(ReflogEntrySchema)
    .describe('Array of reflog entries in reverse chronological order.'),
  totalEntries: z.number().int().describe('Total number of reflog entries.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitReflogLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object with only defined properties
  const reflogOptions: {
    ref?: string;
    maxCount?: number;
  } = {};

  if (input.ref !== undefined) {
    reflogOptions.ref = input.ref;
  }
  if (input.maxCount !== undefined) {
    reflogOptions.maxCount = input.maxCount;
  }

  const result = await provider.reflog(reflogOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    ref: result.ref,
    entries: result.entries,
    totalEntries: result.totalEntries,
  };
}

/**
 * Filter git_reflog output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success, ref name, and total entry count only
 * - standard: Above + complete reflog entries array (RECOMMENDED)
 * - full: Complete output
 */
function filterGitReflogOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential info only
  if (level === 'minimal') {
    return {
      success: result.success,
      ref: result.ref,
      totalEntries: result.totalEntries,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all reflog entries)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitReflogOutput,
});

export const gitReflogTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], createToolHandler(gitReflogLogic)),
  responseFormatter,
};
