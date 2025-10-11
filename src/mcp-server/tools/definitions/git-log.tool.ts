/**
 * @fileoverview Git log tool - view commit history
 * @module mcp-server/tools/definitions/git-log
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  CommitRefSchema,
  LimitSchema,
  SkipSchema,
} from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_log';
const TOOL_TITLE = 'Git Log';
const TOOL_DESCRIPTION =
  'View commit history with optional filtering by author, date range, file path, or commit message pattern.';

const InputSchema = z.object({
  path: PathSchema,
  maxCount: LimitSchema,
  skip: SkipSchema,
  since: z
    .string()
    .optional()
    .describe(
      'Show commits more recent than a specific date (ISO 8601 format).',
    ),
  until: z
    .string()
    .optional()
    .describe('Show commits older than a specific date (ISO 8601 format).'),
  author: z
    .string()
    .optional()
    .describe('Filter commits by author name or email pattern.'),
  grep: z
    .string()
    .optional()
    .describe('Filter commits by message pattern (regex supported).'),
  branch: CommitRefSchema.optional().describe(
    'Show commits from a specific branch or ref (defaults to current branch).',
  ),
  filePath: z
    .string()
    .optional()
    .describe('Show commits that affected a specific file path.'),
  oneline: z
    .boolean()
    .default(false)
    .describe('Show each commit on a single line (abbreviated output).'),
  stat: z
    .boolean()
    .default(false)
    .describe('Include file change statistics for each commit.'),
  patch: z
    .boolean()
    .default(false)
    .describe('Include the full diff patch for each commit.'),
  showSignature: z
    .boolean()
    .default(false)
    .describe('Show GPG signature verification information for each commit.'),
});

const CommitSchema = z.object({
  hash: z.string().describe('Full commit SHA-1 hash.'),
  shortHash: z.string().describe('Abbreviated commit hash (7 characters).'),
  author: z.string().describe('Commit author name.'),
  authorEmail: z.string().describe('Commit author email.'),
  timestamp: z.number().int().describe('Commit timestamp (Unix timestamp).'),
  subject: z.string().describe('First line of the commit message.'),
  body: z.string().optional().describe('Commit message body (if present).'),
  parents: z.array(z.string()).describe('Parent commit hashes.'),
  refs: z
    .array(z.string())
    .optional()
    .describe('References (branches, tags) pointing to this commit.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  commits: z.array(CommitSchema).describe('Array of commit objects.'),
  totalCount: z
    .number()
    .int()
    .describe('Total number of commits returned (may be limited by maxCount).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitLogLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object with only defined properties
  const logOptions: {
    maxCount?: number;
    skip?: number;
    since?: string;
    until?: string;
    author?: string;
    grep?: string;
    branch?: string;
    filePath?: string;
    oneline?: boolean;
    stat?: boolean;
    patch?: boolean;
    showSignature?: boolean;
  } = {};

  if (input.maxCount !== undefined) {
    logOptions.maxCount = input.maxCount;
  }
  if (input.skip !== undefined) {
    logOptions.skip = input.skip;
  }
  if (input.since !== undefined) {
    logOptions.since = input.since;
  }
  if (input.until !== undefined) {
    logOptions.until = input.until;
  }
  if (input.author !== undefined) {
    logOptions.author = input.author;
  }
  if (input.grep !== undefined) {
    logOptions.grep = input.grep;
  }
  if (input.branch !== undefined) {
    logOptions.branch = input.branch;
  }
  if (input.filePath !== undefined) {
    logOptions.filePath = input.filePath;
  }
  if (input.oneline !== undefined) {
    logOptions.oneline = input.oneline;
  }
  if (input.stat !== undefined) {
    logOptions.stat = input.stat;
  }
  if (input.patch !== undefined) {
    logOptions.patch = input.patch;
  }
  if (input.showSignature !== undefined) {
    logOptions.showSignature = input.showSignature;
  }

  const result = await provider.log(logOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    commits: result.commits,
    totalCount: result.totalCount,
  };
}

/**
 * Filter git_log output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and total count only
 * - standard: Above + complete commits array (RECOMMENDED)
 * - full: Complete output
 */
function filterGitLogOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential summary only
  if (level === 'minimal') {
    return {
      success: result.success,
      totalCount: result.totalCount,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all commits)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitLogOutput,
});

export const gitLogTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], createToolHandler(gitLogLogic)),
  responseFormatter,
};
