/**
 * @fileoverview Git tag tool - manage release tags
 * @module mcp-server/tools/definitions/git-tag
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  TagNameSchema,
  CommitRefSchema,
  ForceSchema,
  normalizeMessage,
} from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_tag';
const TOOL_TITLE = 'Git Tag';
const TOOL_DESCRIPTION =
  'Manage tags: list all tags, create a new tag, or delete a tag. Tags are used to mark specific points in history (releases, milestones).';

const InputSchema = z.object({
  path: PathSchema,
  mode: z
    .enum(['list', 'create', 'delete'])
    .default('list')
    .describe('The tag operation to perform.'),
  tagName: TagNameSchema.optional().describe(
    'Tag name for create/delete operations.',
  ),
  commit: CommitRefSchema.optional().describe(
    'Commit to tag (default: HEAD for create operation).',
  ),
  message: z
    .string()
    .optional()
    .describe('Tag message (creates annotated tag).'),
  annotated: z
    .boolean()
    .default(false)
    .describe('Create annotated tag with message.'),
  force: ForceSchema.describe(
    'Force tag creation/deletion (overwrite existing).',
  ),
});

const TagInfoSchema = z.object({
  name: z.string().describe('Tag name.'),
  commit: z.string().describe('Commit hash the tag points to.'),
  message: z.string().optional().describe('Tag message (for annotated tags).'),
  tagger: z.string().optional().describe('Tagger name and email.'),
  timestamp: z.number().int().optional().describe('Tag creation timestamp.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mode: z.string().describe('Operation mode that was performed.'),
  tags: z
    .array(TagInfoSchema)
    .optional()
    .describe('List of tags (for list mode).'),
  created: z
    .string()
    .optional()
    .describe('Created tag name (for create mode).'),
  deleted: z
    .string()
    .optional()
    .describe('Deleted tag name (for delete mode).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitTagLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const tagOptions: {
    mode: 'list' | 'create' | 'delete';
    tagName?: string;
    commit?: string;
    message?: string;
    annotated?: boolean;
    force?: boolean;
  } = {
    mode: input.mode,
  };

  if (input.tagName !== undefined) {
    tagOptions.tagName = input.tagName;
  }
  if (input.commit !== undefined) {
    tagOptions.commit = input.commit;
  }
  if (input.message !== undefined) {
    tagOptions.message = normalizeMessage(input.message);
  }
  if (input.annotated !== undefined) {
    tagOptions.annotated = input.annotated;
  }
  if (input.force !== undefined) {
    tagOptions.force = input.force;
  }

  const result = await provider.tag(tagOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    mode: result.mode,
    tags: result.tags,
    created: result.created,
    deleted: result.deleted,
  };
}

/**
 * Filter git_tag output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and mode only
 * - standard: Above + complete tags array (for list) or created/deleted name (for other ops) (RECOMMENDED)
 * - full: Complete output
 */
function filterGitTagOutput(
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
  // (LLMs need complete context - include all tags or operation results)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitTagOutput,
});

export const gitTagTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitTagLogic)),
  responseFormatter,
};
