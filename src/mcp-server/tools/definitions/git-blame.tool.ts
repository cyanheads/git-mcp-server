/**
 * @fileoverview Git blame tool - show line-by-line authorship
 * @module mcp-server/tools/definitions/git-blame
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema } from '../schemas/common.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_blame';
const TOOL_TITLE = 'Git Blame';
const TOOL_DESCRIPTION =
  'Show line-by-line authorship information for a file, displaying who last modified each line and when. For large files, use startLine/endLine to limit output.';

const InputSchema = z
  .object({
    path: PathSchema,
    filePath: z
      .string()
      .min(1)
      .describe('Path to the file to blame (relative to repository root).'),
    startLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Start line number (1-indexed).'),
    endLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('End line number (1-indexed).'),
    ignoreWhitespace: z
      .boolean()
      .default(false)
      .describe('Ignore whitespace changes.'),
  })
  .strict();

const BlameLineSchema = z.object({
  lineNumber: z
    .number()
    .int()
    .min(1)
    .describe('Line number in the file (1-indexed).'),
  commitHash: z
    .string()
    .describe('Full commit hash of the last change to this line.'),
  author: z.string().describe('Author who last modified this line.'),
  timestamp: z
    .number()
    .int()
    .describe('Unix timestamp of the commit that last modified this line.'),
  content: z.string().describe('The actual content/text of this line.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  filePath: z.string().describe('The file that was blamed.'),
  lines: z
    .array(BlameLineSchema)
    .describe('Array of blame information for each line.'),
  totalLines: z.number().int().describe('Total number of lines in the output.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitBlameLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const blameOptions: {
    file: string;
    startLine?: number;
    endLine?: number;
    ignoreWhitespace?: boolean;
  } = {
    file: input.filePath,
    ignoreWhitespace: input.ignoreWhitespace,
  };

  if (input.startLine !== undefined) {
    blameOptions.startLine = input.startLine;
  }
  if (input.endLine !== undefined) {
    blameOptions.endLine = input.endLine;
  }

  const result = await provider.blame(blameOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    filePath: result.file,
    lines: result.lines,
    totalLines: result.totalLines,
  };
}

/**
 * Filter git_blame output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: File and total lines only
 * - standard: Above + complete line-by-line blame information (RECOMMENDED)
 * - full: Complete output
 */
function filterGitBlameOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  if (level === 'minimal') {
    return {
      success: result.success,
      filePath: result.filePath,
      totalLines: result.totalLines,
    };
  }
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitBlameOutput,
});

export const gitBlameTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], createToolHandler(gitBlameLogic)),
  responseFormatter,
};
