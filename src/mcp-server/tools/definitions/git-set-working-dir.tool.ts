/**
 * @fileoverview Git set working directory tool - manage session working directory
 * @module mcp-server/tools/definitions/git-set-working-dir
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { JsonRpcErrorCode, McpError } from '@/types-global/errors.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  gatherRepoSnapshot,
  RepoSnapshotCommitSchema,
  RepoSnapshotRemoteSchema,
  RepoSnapshotStatusSchema,
  RepoSnapshotTagSchema,
} from '../utils/repo-snapshot.js';

const TOOL_NAME = 'git_set_working_dir';
const TOOL_TITLE = 'Git Set Working Directory';
const TOOL_DESCRIPTION =
  'Set the session working directory for all git operations so subsequent calls can omit the path parameter. Always returns a repository snapshot (status, recent commits, recent tags, remotes) to orient the caller.';

const InputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Absolute path to the git repository to use as the working directory.',
    ),
  validateGitRepo: z
    .boolean()
    .default(true)
    .describe('Validate that the path is a Git repository.'),
  initializeIfNotPresent: z
    .boolean()
    .default(false)
    .describe("If not a Git repository, initialize it with 'git init'."),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  path: z.string().describe('The working directory that was set.'),
  message: z.string().describe('Confirmation message.'),
  repository: z
    .object({
      status: RepoSnapshotStatusSchema,
      recentCommits: z
        .array(RepoSnapshotCommitSchema)
        .describe('Up to 2 most recent commits on the current branch.'),
      recentTags: z
        .array(RepoSnapshotTagSchema)
        .describe('Up to 2 most recent tags by creator date.'),
      remotes: z
        .array(RepoSnapshotRemoteSchema)
        .describe('Configured remote repositories.'),
    })
    .optional()
    .describe(
      'Best-effort repository snapshot. Omitted when the path is not a git repository (see enrichmentWarnings).',
    ),
  enrichmentWarnings: z
    .array(z.string())
    .optional()
    .describe(
      'Actionable notes when snapshot gathering was skipped or partially failed.',
    ),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

/**
 * Ensure the target path is a git repository before we pin it as the session
 * working directory. Owns its own try/catch because the fallback path
 * (initialize-if-missing) treats the thrown validation error as a signal rather
 * than a failure. Throws an actionable McpError when no fallback is available.
 */
async function ensureRepositoryReady(
  input: ToolInput,
  dependencies: ToolLogicDependencies,
  tenantId: string,
): Promise<void> {
  if (!input.validateGitRepo) return;

  const { provider, appContext } = dependencies;
  const opContext = {
    workingDirectory: input.path,
    requestContext: appContext,
    tenantId,
  };

  try {
    await provider.validateRepository(input.path, opContext);
    return;
  } catch (error) {
    if (input.initializeIfNotPresent) {
      await provider.init(
        { path: input.path, initialBranch: 'main', bare: false },
        opContext,
      );
      return;
    }
    const original = error instanceof Error ? error.message : String(error);
    throw new McpError(
      JsonRpcErrorCode.ValidationError,
      `Path is not a git repository: ${input.path}. Pass initializeIfNotPresent: true to run 'git init' here, or point at an existing repository. Underlying error: ${original}`,
      { path: input.path },
    );
  }
}

async function gitSetWorkingDirLogic(
  input: ToolInput,
  dependencies: ToolLogicDependencies,
): Promise<ToolOutput> {
  const { provider, storage, appContext } = dependencies;
  const tenantId = appContext.tenantId || 'default-tenant';

  await ensureRepositoryReady(input, dependencies, tenantId);

  const storageKey = `session:workingDir:${tenantId}`;
  await storage.set(storageKey, input.path, appContext);

  const { snapshot, warnings } = await gatherRepoSnapshot(
    { provider, appContext, workingDirectory: input.path },
    { commitLimit: 2, tagLimit: 2, includeRemotes: true },
  );

  return {
    success: true,
    path: input.path,
    message: `Working directory set to: ${input.path}`,
    ...(snapshot
      ? {
          repository: {
            status: snapshot.status,
            recentCommits: snapshot.recentCommits,
            recentTags: snapshot.recentTags,
            remotes: snapshot.remotes ?? [],
          },
        }
      : {}),
    ...(warnings.length > 0 ? { enrichmentWarnings: warnings } : {}),
  };
}

/**
 * - minimal: success + path only
 * - standard/full: everything (message, repository, warnings)
 */
function filterGitSetWorkingDirOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  if (level === 'minimal') {
    return { success: result.success, path: result.path };
  }
  return result;
}

const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitSetWorkingDirOutput,
});

export const gitSetWorkingDirTool: ToolDefinition<
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
    createToolHandler(gitSetWorkingDirLogic, { skipPathResolution: true }),
  ),
  responseFormatter,
};
