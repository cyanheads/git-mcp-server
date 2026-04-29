/**
 * @fileoverview Git remote tool - manage remote repositories
 * @module mcp-server/tools/definitions/git-remote
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, RemoteNameSchema } from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_remote';
const TOOL_TITLE = 'Git Remote';
const TOOL_DESCRIPTION =
  'Manage remote repositories: list remotes, add new remotes, remove remotes, rename remotes, or get/set remote URLs.';

const InputSchema = z
  .object({
    path: PathSchema,
    mode: z
      .enum(['list', 'add', 'remove', 'rename', 'get-url', 'set-url'])
      .default('list')
      .describe('The remote operation to perform.'),
    name: RemoteNameSchema.optional().describe(
      'Remote name for add/remove/rename/get-url/set-url operations.',
    ),
    url: z
      .string()
      .url()
      .optional()
      .describe('Remote URL for add/set-url operations.'),
    newName: RemoteNameSchema.optional().describe(
      'New remote name for rename operation.',
    ),
    push: z
      .boolean()
      .default(false)
      .describe('Set push URL separately (for set-url operation).'),
  })
  .strict();

const RemoteInfoSchema = z.object({
  name: z.string().describe('Remote name.'),
  fetchUrl: z.string().describe('Fetch URL.'),
  pushUrl: z.string().describe('Push URL (may differ from fetch URL).'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mode: z.string().describe('Operation mode that was performed.'),
  remotes: z
    .array(RemoteInfoSchema)
    .optional()
    .describe('List of remotes (for list mode).'),
  url: z.string().optional().describe('Remote URL (for get-url mode).'),
  added: z
    .object({
      name: z.string(),
      url: z.string(),
    })
    .optional()
    .describe('Added remote (for add mode).'),
  removed: z
    .string()
    .optional()
    .describe('Removed remote name (for remove mode).'),
  renamed: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional()
    .describe('Rename information (for rename mode).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitRemoteLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const remoteOptions: {
    mode: 'list' | 'add' | 'remove' | 'rename' | 'get-url' | 'set-url';
    name?: string;
    url?: string;
    newName?: string;
    push?: boolean;
  } = {
    mode: input.mode,
  };

  if (input.name !== undefined) {
    remoteOptions.name = input.name;
  }
  if (input.url !== undefined) {
    remoteOptions.url = input.url;
  }
  if (input.newName !== undefined) {
    remoteOptions.newName = input.newName;
  }
  if (input.push !== undefined) {
    remoteOptions.push = input.push;
  }

  const result = await provider.remote(remoteOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    mode: result.mode,
    remotes: result.remotes,
    url: result.url,
    added: result.added,
    removed: result.removed,
    renamed: result.renamed,
  };
}

/**
 * Filter git_remote output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and mode only
 * - standard: Above + complete remotes array (for list) or operation results (RECOMMENDED)
 * - full: Complete output
 */
function filterGitRemoteOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential info only
  if (level === 'minimal') {
    return {
      success: result.success,
      mode: result.mode,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all remotes or operation results)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitRemoteOutput,
});

export const gitRemoteTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:read'], createToolHandler(gitRemoteLogic)),
  responseFormatter,
};
