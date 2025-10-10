/**
 * @fileoverview Git commit tool - create a new commit
 * @module mcp-server/tools/definitions/git-commit
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  CommitMessageSchema,
  NoVerifySchema,
  PathSchema,
  SignSchema,
} from '../schemas/common.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';

const TOOL_NAME = 'git_commit';
const TOOL_TITLE = 'Git Commit';
const TOOL_DESCRIPTION =
  'Create a new commit with staged changes in the repository. Records a snapshot of the staging area with a commit message.';

const InputSchema = z.object({
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
  sign: SignSchema,
  noVerify: NoVerifySchema,
  filesToStage: z
    .array(z.string())
    .optional()
    .describe(
      'File paths to stage before committing (atomic stage+commit operation).',
    ),
  forceUnsignedOnFailure: z
    .boolean()
    .default(false)
    .describe(
      'If GPG/SSH signing fails, retry the commit without signing instead of failing.',
    ),
});

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
  status: z
    .object({
      current_branch: z
        .string()
        .nullable()
        .describe('Current branch name after commit.'),
      staged_changes: z
        .record(z.any())
        .describe('Remaining staged changes after commit.'),
      unstaged_changes: z
        .record(z.any())
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

  // Build options object with only defined properties
  const commitOptions: {
    message: string;
    author?: { name: string; email: string };
    amend?: boolean;
    allowEmpty?: boolean;
    sign?: boolean;
    noVerify?: boolean;
    forceUnsignedOnFailure?: boolean;
  } = {
    message: input.message,
    amend: input.amend,
    allowEmpty: input.allowEmpty,
    noVerify: input.noVerify,
    forceUnsignedOnFailure: input.forceUnsignedOnFailure,
  };

  if (input.author !== undefined) {
    commitOptions.author = input.author;
  }
  if (input.sign !== undefined) {
    commitOptions.sign = input.sign;
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

  // Helper to convert staged/unstaged changes to flat arrays
  const flattenChanges = (changes: {
    added?: string[];
    modified?: string[];
    deleted?: string[];
    renamed?: string[];
    copied?: string[];
  }): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    if (changes.added && changes.added.length > 0) result.added = changes.added;
    if (changes.modified && changes.modified.length > 0)
      result.modified = changes.modified;
    if (changes.deleted && changes.deleted.length > 0)
      result.deleted = changes.deleted;
    if (changes.renamed && changes.renamed.length > 0)
      result.renamed = changes.renamed;
    if (changes.copied && changes.copied.length > 0)
      result.copied = changes.copied;
    return result;
  };

  return {
    success: result.success,
    commitHash: result.commitHash,
    message: result.message,
    author: result.author,
    timestamp: result.timestamp,
    filesChanged: result.filesChanged.length,
    committedFiles: result.filesChanged,
    insertions: undefined,
    deletions: undefined,
    status: {
      current_branch: statusResult.currentBranch,
      staged_changes: flattenChanges(statusResult.stagedChanges),
      unstaged_changes: flattenChanges(statusResult.unstagedChanges),
      untracked_files: statusResult.untrackedFiles,
      conflicted_files: statusResult.conflictedFiles,
      is_clean: statusResult.isClean,
    },
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Commit Created Successfully\n\n`;
  const commitInfo =
    `**Commit Hash:** ${result.commitHash}\n` +
    `**Author:** ${result.author}\n` +
    `**Date:** ${new Date(result.timestamp * 1000).toISOString()}\n` +
    `**Message:** ${result.message}\n\n`;

  const stats =
    result.filesChanged !== undefined
      ? `## Changes\n` +
        `- **Files Changed:** ${result.filesChanged}\n` +
        (result.insertions !== undefined
          ? `- **Insertions:** +${result.insertions}\n`
          : '') +
        (result.deletions !== undefined
          ? `- **Deletions:** -${result.deletions}\n`
          : '') +
        `\n`
      : '';

  // List of committed files
  const committedFilesSection =
    result.committedFiles.length > 0
      ? `## Committed Files (${result.committedFiles.length})\n${result.committedFiles.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  // Repository status after commit
  const statusSection = `## Repository Status After Commit\n`;
  const branchInfo = `**Branch:** ${result.status.current_branch || 'detached HEAD'}\n`;
  const cleanStatus = result.status.is_clean
    ? `**Status:** Clean (no uncommitted changes)\n\n`
    : `**Status:** Has uncommitted changes\n\n`;

  // Show remaining changes if not clean
  let remainingChanges = '';
  if (!result.status.is_clean) {
    const staged = Object.keys(result.status.staged_changes);
    const unstaged = Object.keys(result.status.unstaged_changes);
    const untracked = result.status.untracked_files.length;

    if (staged.length > 0) {
      remainingChanges += `### Staged Changes\n`;
      staged.forEach((type) => {
        const files = (
          result.status.staged_changes as Record<string, string[]>
        )[type];
        if (files && files.length > 0) {
          remainingChanges += `**${type}:** ${files.length} file(s)\n`;
        }
      });
      remainingChanges += `\n`;
    }

    if (unstaged.length > 0) {
      remainingChanges += `### Unstaged Changes\n`;
      unstaged.forEach((type) => {
        const files = (
          result.status.unstaged_changes as Record<string, string[]>
        )[type];
        if (files && files.length > 0) {
          remainingChanges += `**${type}:** ${files.length} file(s)\n`;
        }
      });
      remainingChanges += `\n`;
    }

    if (untracked > 0) {
      remainingChanges += `### Untracked Files: ${untracked}\n\n`;
    }
  }

  return [
    {
      type: 'text',
      text: `${summary}${commitInfo}${stats}${committedFilesSection}${statusSection}${branchInfo}${cleanStatus}${remainingChanges}`.trim(),
    },
  ];
}

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
