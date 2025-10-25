/**
 * @fileoverview Git set working directory tool - manage session working directory
 * @module mcp-server/tools/definitions/git-set-working-dir
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';

const TOOL_NAME = 'git_set_working_dir';
const TOOL_TITLE = 'Git Set Working Directory';
const TOOL_DESCRIPTION =
  'Set the session working directory for all git operations. This allows subsequent git commands to omit the path parameter and use this directory as the default.';

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
  includeMetadata: z
    .boolean()
    .default(false)
    .describe(
      'Include repository metadata (status, branches, remotes, recent commits) in the response. Set to true for immediate repository context understanding. Defaults to false to minimize response size.',
    ),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  path: z.string().describe('The working directory that was set.'),
  message: z.string().describe('Confirmation message.'),
  repositoryContext: z
    .object({
      status: z
        .object({
          branch: z
            .string()
            .nullable()
            .describe('Current branch name (null if detached HEAD).'),
          isClean: z.boolean().describe('True if working directory is clean.'),
          stagedCount: z
            .number()
            .int()
            .describe('Number of staged files ready for commit.'),
          unstagedCount: z
            .number()
            .int()
            .describe('Number of files with unstaged changes.'),
          untrackedCount: z
            .number()
            .int()
            .describe('Number of untracked files.'),
          conflictsCount: z
            .number()
            .int()
            .describe('Number of files with merge conflicts.'),
        })
        .describe('Current repository working tree status.'),
      branches: z
        .object({
          current: z
            .string()
            .nullable()
            .describe('Current branch name (null if detached HEAD).'),
          totalLocal: z
            .number()
            .int()
            .describe('Total number of local branches.'),
          totalRemote: z
            .number()
            .int()
            .describe('Total number of remote-tracking branches.'),
          upstream: z
            .string()
            .optional()
            .describe(
              'Upstream branch name if current branch is tracking one.',
            ),
          ahead: z
            .number()
            .int()
            .optional()
            .describe('Commits ahead of upstream (if tracking).'),
          behind: z
            .number()
            .int()
            .optional()
            .describe('Commits behind upstream (if tracking).'),
        })
        .describe('Branch information and tracking status.'),
      remotes: z
        .array(
          z.object({
            name: z.string().describe('Remote name.'),
            fetchUrl: z.string().describe('Fetch URL.'),
            pushUrl: z.string().describe('Push URL (may differ from fetch).'),
          }),
        )
        .describe('Configured remote repositories.'),
      recentCommits: z
        .array(
          z.object({
            hash: z.string().describe('Commit hash (short form).'),
            author: z.string().describe('Commit author name.'),
            date: z.string().describe('Commit date (ISO 8601 format).'),
            message: z.string().describe('Commit message (first line).'),
          }),
        )
        .describe('Recent commits (up to 5 most recent).'),
    })
    .optional()
    .describe(
      'Rich repository metadata including status, branches, remotes, and recent history. Only included when includeMetadata parameter is true.',
    ),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

/**
 * Gather rich repository context including status, branches, remotes, and recent commits.
 * This provides LLMs with immediate understanding of repository state.
 *
 * Failures in context gathering are logged but don't fail the operation - context is
 * nice-to-have enrichment, not critical for setting the working directory.
 */
async function gatherRepositoryContext(
  targetPath: string,
  dependencies: ToolLogicDependencies,
): Promise<ToolOutput['repositoryContext']> {
  const { provider, appContext } = dependencies;
  const tenantId = appContext.tenantId || 'default-tenant';
  const context = {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId,
  };

  try {
    // Gather all context in parallel for efficiency
    const [statusResult, branchesResult, remotesResult, logResult] =
      await Promise.allSettled([
        provider.status({ includeUntracked: true }, context),
        provider.branch({ mode: 'list', remote: true }, context),
        provider.remote({ mode: 'list' }, context),
        provider.log({ maxCount: 5 }, context),
      ]);

    // Process status
    const status =
      statusResult.status === 'fulfilled'
        ? {
            branch: statusResult.value.currentBranch,
            isClean: statusResult.value.isClean,
            stagedCount:
              (statusResult.value.stagedChanges.added?.length || 0) +
              (statusResult.value.stagedChanges.modified?.length || 0) +
              (statusResult.value.stagedChanges.deleted?.length || 0) +
              (statusResult.value.stagedChanges.renamed?.length || 0) +
              (statusResult.value.stagedChanges.copied?.length || 0),
            unstagedCount:
              (statusResult.value.unstagedChanges.added?.length || 0) +
              (statusResult.value.unstagedChanges.modified?.length || 0) +
              (statusResult.value.unstagedChanges.deleted?.length || 0),
            untrackedCount: statusResult.value.untrackedFiles.length,
            conflictsCount: statusResult.value.conflictedFiles.length,
          }
        : {
            branch: null,
            isClean: false,
            stagedCount: 0,
            unstagedCount: 0,
            untrackedCount: 0,
            conflictsCount: 0,
          };

    // Process branches
    const branches: NonNullable<ToolOutput['repositoryContext']>['branches'] =
      branchesResult.status === 'fulfilled' &&
      branchesResult.value.mode === 'list'
        ? (() => {
            const branchList = branchesResult.value.branches;
            const currentBranch = branchList.find((b) => b.current);
            const localBranches = branchList.filter(
              (b) => !b.name.startsWith('remotes/'),
            );
            const remoteBranches = branchList.filter((b) =>
              b.name.startsWith('remotes/'),
            );

            return {
              current: currentBranch?.name || null,
              totalLocal: localBranches.length,
              totalRemote: remoteBranches.length,
              upstream: currentBranch?.upstream,
              ahead: currentBranch?.ahead,
              behind: currentBranch?.behind,
            };
          })()
        : {
            current: null,
            totalLocal: 0,
            totalRemote: 0,
          };

    // Process remotes
    const remotes: NonNullable<ToolOutput['repositoryContext']>['remotes'] =
      remotesResult.status === 'fulfilled' &&
      remotesResult.value.mode === 'list'
        ? remotesResult.value.remotes || []
        : [];

    // Process recent commits
    const recentCommits: NonNullable<
      ToolOutput['repositoryContext']
    >['recentCommits'] =
      logResult.status === 'fulfilled'
        ? logResult.value.commits.map((commit) => ({
            hash: commit.shortHash,
            author: commit.author,
            date: new Date(commit.timestamp * 1000).toISOString(),
            message: commit.subject,
          }))
        : [];

    return {
      status,
      branches,
      remotes,
      recentCommits,
    };
  } catch (error) {
    // Log error but return undefined - context gathering is optional
    const { logger } = await import('@/utils/index.js');
    logger.debug('Failed to gather repository context', {
      ...appContext,
      error: error instanceof Error ? error.message : String(error),
      targetPath,
    });
    return undefined;
  }
}

async function gitSetWorkingDirLogic(
  input: ToolInput,
  dependencies: ToolLogicDependencies,
): Promise<ToolOutput> {
  const { provider, storage, appContext } = dependencies;

  // Graceful degradation for tenantId
  const tenantId = appContext.tenantId || 'default-tenant';

  // Validate git repository if requested (using provider interface instead of direct CLI import)
  if (input.validateGitRepo) {
    try {
      await provider.validateRepository(input.path, {
        workingDirectory: input.path,
        requestContext: appContext,
        tenantId,
      });
    } catch (error) {
      // If validation fails and initializeIfNotPresent is true, initialize the repo
      if (input.initializeIfNotPresent) {
        await provider.init(
          {
            path: input.path,
            initialBranch: 'main',
            bare: false,
          },
          {
            workingDirectory: input.path,
            requestContext: appContext,
            tenantId,
          },
        );
      } else {
        // Re-throw validation error if initializeIfNotPresent is false
        throw error;
      }
    }
  }

  // Store the working directory in session storage
  const storageKey = `session:workingDir:${tenantId}`;
  await storage.set(storageKey, input.path, appContext);

  // Gather repository metadata only if requested
  const repositoryContext = input.includeMetadata
    ? await gatherRepositoryContext(input.path, dependencies)
    : undefined;

  return {
    success: true,
    path: input.path,
    message: `Working directory set to: ${input.path}`,
    repositoryContext,
  };
}

/**
 * Filter git_set_working_dir output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and path only (omits message and metadata)
 * - standard: Success, path, message, and full repository metadata (if includeMetadata was true)
 * - full: Complete output (same as standard)
 *
 * Note: Repository metadata is only gathered when includeMetadata parameter is true.
 * Verbosity filtering applies to the response format, not whether metadata is gathered.
 */
function filterGitSetWorkingDirOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential info only - no message, no metadata
  if (level === 'minimal') {
    return {
      success: result.success,
      path: result.path,
    };
  }

  // standard & full: Complete output including metadata (if it was requested)
  return result;
}

// Create JSON response formatter with verbosity filtering
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
