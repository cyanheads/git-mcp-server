/**
 * @fileoverview Git clone tool - clone a repository from a remote URL
 * @module mcp-server/tools/definitions/git-clone
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { DepthSchema } from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_clone';
const TOOL_TITLE = 'Git Clone';
const TOOL_DESCRIPTION =
  'Clone a repository from a remote URL to a local path. Supports HTTP/HTTPS and SSH URLs, with optional shallow cloning.';

const InputSchema = z.object({
  url: z.string().url().describe('Remote repository URL to clone from.'),
  localPath: z
    .string()
    .min(1)
    .describe('Local path where the repository should be cloned.'),
  branch: z
    .string()
    .optional()
    .describe('Specific branch to clone (defaults to remote HEAD).'),
  depth: DepthSchema,
  bare: z
    .boolean()
    .default(false)
    .describe('Create a bare repository (no working directory).'),
  mirror: z
    .boolean()
    .default(false)
    .describe('Create a mirror clone (implies bare).'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  remoteUrl: z.string().describe('The remote URL that was cloned.'),
  localPath: z.string().describe('Local path where repository was cloned.'),
  branch: z.string().describe('The branch that was checked out.'),
  commitHash: z.string().optional().describe('Current HEAD commit hash.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitCloneLogic(
  input: ToolInput,
  { provider, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object with only defined properties
  const cloneOptions: {
    remoteUrl: string;
    localPath: string;
    branch?: string;
    depth?: number;
    bare?: boolean;
    mirror?: boolean;
  } = {
    remoteUrl: input.url,
    localPath: input.localPath,
    bare: input.bare,
    mirror: input.mirror,
  };

  if (input.branch !== undefined) {
    cloneOptions.branch = input.branch;
  }
  if (input.depth !== undefined) {
    cloneOptions.depth = input.depth;
  }

  const result = await provider.clone(cloneOptions, {
    workingDirectory: process.cwd(),
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    remoteUrl: result.remoteUrl,
    localPath: result.localPath,
    branch: result.branch,
  };
}

/**
 * Filter git_clone output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success, local path, and remote URL only
 * - standard: Above + branch and commit hash (RECOMMENDED)
 * - full: Complete output
 */
function filterGitCloneOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential info only
  if (level === 'minimal') {
    return {
      success: result.success,
      remoteUrl: result.remoteUrl,
      localPath: result.localPath,
    };
  }

  // standard & full: Complete output
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitCloneOutput,
});

export const gitCloneTool: ToolDefinition<
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
    createToolHandler(gitCloneLogic, { skipPathResolution: true }),
  ),
  responseFormatter,
};
