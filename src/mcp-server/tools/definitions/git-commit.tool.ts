/**
 * @fileoverview Git commit tool - create a new commit
 * @module mcp-server/tools/definitions/git-commit
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  CommitMessageSchema,
  NoVerifySchema,
  PathSchema,
} from '../schemas/common.js';
import { flattenChanges } from '../utils/git-formatters.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';

const TOOL_NAME = 'git_commit';
const TOOL_TITLE = 'Git Commit';
const TOOL_DESCRIPTION = `Create a new commit with staged changes in the repository. Records a snapshot of the staging area with a commit message.

**Commit Message Format:**
Pass commit messages as JSON string parameters. Multi-line messages are supported using standard JSON string escaping.

**Examples:**
- Single line: { "message": "feat: add user authentication" }
- Multi-line: { "message": "feat: add user authentication\\n\\nImplemented OAuth2 flow with JWT tokens.\\nAdded tests for login and logout." }

Note: Do not use bash heredoc syntax. Literal escape sequences (\\n, \\t) in the message string are automatically normalized to their actual characters.`;

const InputSchema = z
  .object({
    path: PathSchema,
    message: CommitMessageSchema,
    author: z
      .object({
        name: z.string().min(1).describe("Author's name"),
        email: z.string().email().describe("Author's email address"),
      })
      .optional()
      .describe('Override commit author (defaults to git config).'),
    amend: z
      .boolean()
      .default(false)
      .describe(
        'Amend the previous commit instead of creating a new one. Use with caution.',
      ),
    allowEmpty: z
      .boolean()
      .default(false)
      .describe('Allow creating a commit with no changes.'),
    noVerify: NoVerifySchema,
    filesToStage: z
      .array(z.string())
      .optional()
      .describe(
        'File paths to stage before committing (atomic stage+commit operation).',
      ),
  })
  .strict();

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  commitHash: z.string().describe('SHA-1 hash of the created commit.'),
  message: z.string().describe('The commit message.'),
  author: z.string().describe('Author of the commit.'),
  timestamp: z
    .number()
    .int()
    .describe('Unix timestamp when the commit was created.'),
  filesChanged: z
    .number()
    .int()
    .optional()
    .describe('Number of files changed in this commit.'),
  committedFiles: z
    .array(z.string())
    .describe('List of files that were committed.'),
  insertions: z
    .number()
    .int()
    .optional()
    .describe('Number of line insertions.'),
  deletions: z.number().int().optional().describe('Number of line deletions.'),
  signed: z
    .boolean()
    .describe(
      'Whether the commit was signed. False when GIT_SIGN_COMMITS=false or when signing was attempted and fell back to unsigned on failure.',
    ),
  signingWarning: z
    .string()
    .optional()
    .describe(
      'Populated only when signing was requested but failed, and the commit was created unsigned as a fallback.',
    ),
  status: z
    .object({
      current_branch: z
        .string()
        .nullable()
        .describe('Current branch name after commit.'),
      staged_changes: z
        .record(z.string(), z.any())
        .describe('Remaining staged changes after commit.'),
      unstaged_changes: z
        .record(z.string(), z.any())
        .describe('Unstaged changes after commit.'),
      untracked_files: z
        .array(z.string())
        .describe('Untracked files after commit.'),
      conflicted_files: z
        .array(z.string())
        .describe('Conflicted files after commit.'),
      is_clean: z.boolean().describe('Whether working directory is clean.'),
    })
    .describe('Repository status after the commit.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitCommitLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Stage files if requested (atomic operation)
  if (input.filesToStage && input.filesToStage.length > 0) {
    await provider.add(
      { paths: input.filesToStage },
      {
        workingDirectory: targetPath,
        requestContext: appContext,
        tenantId: appContext.tenantId || 'default-tenant',
      },
    );
  }

  const commitOptions: {
    message: string;
    author?: { name: string; email: string };
    amend?: boolean;
    allowEmpty?: boolean;
    noVerify?: boolean;
  } = {
    message: input.message,
    amend: input.amend,
    allowEmpty: input.allowEmpty,
    noVerify: input.noVerify,
  };

  if (input.author !== undefined) {
    commitOptions.author = input.author;
  }

  const result = await provider.commit(commitOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  // Get repository status after commit
  const statusResult = await provider.status(
    { includeUntracked: true },
    {
      workingDirectory: targetPath,
      requestContext: appContext,
      tenantId: appContext.tenantId || 'default-tenant',
    },
  );

  const output: ToolOutput = {
    success: result.success,
    commitHash: result.commitHash,
    message: result.message,
    author: result.author,
    timestamp: result.timestamp,
    filesChanged: result.filesChanged.length,
    committedFiles: result.filesChanged,
    signed: result.signed,
    status: {
      current_branch: statusResult.currentBranch,
      staged_changes: flattenChanges(statusResult.stagedChanges),
      unstaged_changes: flattenChanges(statusResult.unstagedChanges),
      untracked_files: statusResult.untrackedFiles,
      conflicted_files: statusResult.conflictedFiles,
      is_clean: statusResult.isClean,
    },
  };

  if (result.signingWarning) {
    output.signingWarning = result.signingWarning;
  }

  return output;
}

/**
 * Filter git_commit output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Core commit info only (hash, success, message)
 * - standard: Above + file stats + basic status (RECOMMENDED)
 * - full: Complete output including detailed status breakdown
 */
function filterGitCommitOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // `signed` and `signingWarning` are surfaced at every verbosity level —
  // signing drift is important enough to never hide.
  if (level === 'minimal') {
    return {
      success: result.success,
      commitHash: result.commitHash,
      message: result.message,
      signed: result.signed,
      ...(result.signingWarning && { signingWarning: result.signingWarning }),
      status: {
        current_branch: result.status.current_branch,
        is_clean: result.status.is_clean,
        staged_changes: {},
        unstaged_changes: {},
        untracked_files: [],
        conflicted_files: [],
      },
    };
  }

  if (level === 'standard') {
    return {
      success: result.success,
      commitHash: result.commitHash,
      message: result.message,
      author: result.author,
      timestamp: result.timestamp,
      filesChanged: result.filesChanged,
      insertions: result.insertions,
      deletions: result.deletions,
      committedFiles: result.committedFiles,
      signed: result.signed,
      ...(result.signingWarning && { signingWarning: result.signingWarning }),
      status: {
        current_branch: result.status.current_branch,
        is_clean: result.status.is_clean,
        // Include complete status with all file arrays (LLMs need full context)
        staged_changes: result.status.staged_changes,
        unstaged_changes: result.status.unstaged_changes,
        untracked_files: result.status.untracked_files,
        conflicted_files: result.status.conflicted_files,
      },
    };
  }

  // full: Complete output (no filtering)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitCommitOutput,
});

export const gitCommitTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitCommitLogic)),
  responseFormatter,
};
