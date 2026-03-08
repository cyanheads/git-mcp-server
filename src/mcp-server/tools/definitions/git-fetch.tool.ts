/**
 * @fileoverview Git fetch tool - download objects and refs from remote
 * @module mcp-server/tools/definitions/git-fetch
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  RemoteNameSchema,
  PruneSchema,
  DepthSchema,
} from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_fetch';
const TOOL_TITLE = 'Git Fetch';
const TOOL_DESCRIPTION =
  'Fetch updates from a remote repository. Downloads objects and refs without merging them. Use when the user wants to retrieve content from a URL or remote source.';

const InputSchema = z.object({
  path: PathSchema,
  remote: RemoteNameSchema.optional().describe(
    'Remote name (default: origin).',
  ),
  prune: PruneSchema,
  tags: z.boolean().default(false).describe('Fetch all tags from the remote.'),
  depth: DepthSchema,
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  remote: z.string().describe('Remote name that was fetched from.'),
  fetchedRefs: z
    .array(z.string())
    .describe('References that were fetched from the remote.'),
  prunedRefs: z
    .array(z.string())
    .describe('References that were pruned (deleted locally).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitFetchLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const fetchOptions: {
    remote?: string;
    prune?: boolean;
    tags?: boolean;
    depth?: number;
  } = {};

  if (input.remote !== undefined) {
    fetchOptions.remote = input.remote;
  }
  if (input.prune !== undefined) {
    fetchOptions.prune = input.prune;
  }
  if (input.tags !== undefined) {
    fetchOptions.tags = input.tags;
  }
  if (input.depth !== undefined) {
    fetchOptions.depth = input.depth;
  }

  const result = await provider.fetch(fetchOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    remote: result.remote,
    fetchedRefs: result.fetchedRefs,
    prunedRefs: result.prunedRefs,
  };
}

/**
 * Filter git_fetch output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and remote name only
 * - standard: Above + complete lists of fetched/pruned refs (RECOMMENDED)
 * - full: Complete output (same as standard)
 */
function filterGitFetchOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential status only
  if (level === 'minimal') {
    return {
      success: result.success,
      remote: result.remote,
    };
  }

  // standard & full: Complete output with all ref lists
  // (LLMs need complete context - include all fetched/pruned refs)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitFetchOutput,
});

export const gitFetchTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitFetchLogic)),
  responseFormatter,
};
