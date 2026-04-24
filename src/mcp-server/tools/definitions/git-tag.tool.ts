/**
 * @fileoverview Git tag tool - manage release tags
 * @module mcp-server/tools/definitions/git-tag
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { JsonRpcErrorCode, McpError } from '@/types-global/errors.js';
import {
  PathSchema,
  TagNameSchema,
  CommitRefSchema,
  ForceSchema,
  LimitSchema,
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
  'Manage tags: list all tags, create a new tag, delete a tag, or verify a signed tag. Tags are used to mark specific points in history (releases, milestones). Verify runs `git tag -v` and returns a structured result distinguishing unsigned tags, missing trust configuration, bad signatures, and valid signatures.';

const InputSchema = z.object({
  path: PathSchema,
  mode: z
    .enum(['list', 'create', 'delete', 'verify'])
    .default('list')
    .describe('The tag operation to perform.'),
  tagName: TagNameSchema.optional().describe(
    'Tag name for create/delete/verify operations.',
  ),
  commit: CommitRefSchema.optional().describe(
    'Commit to tag (default: HEAD for create operation).',
  ),
  message: z
    .string()
    .optional()
    .describe(
      'Tag message. Providing a message always produces an annotated tag (git does not support messages on lightweight tags). For release tags, summarize notable changes.',
    ),
  annotated: z
    .boolean()
    .default(false)
    .describe(
      'Create an annotated tag with a default "Tag <name>" message. Only effective when no message is provided and signing is disabled — otherwise the tag is always annotated.',
    ),
  force: ForceSchema.describe(
    'Overwrite an existing tag (create mode only; has no effect on list or delete).',
  ),
  limit: LimitSchema.describe(
    'For list mode: cap the number of tags returned (applied at the git command via `--count=N`). Use on repos with many tags.',
  ),
});

const TagInfoSchema = z.object({
  name: z.string().describe('Tag name.'),
  commit: z.string().describe('Commit hash the tag points to.'),
  message: z
    .string()
    .optional()
    .describe(
      'First line of the tag annotation (annotated tags only). See `annotationBody` for the remainder.',
    ),
  annotationBody: z
    .string()
    .optional()
    .describe(
      'Remaining annotation body after the subject line (annotated tags only).',
    ),
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
  signed: z
    .boolean()
    .optional()
    .describe(
      'Whether the created tag was signed. Only populated for create mode. False when GIT_SIGN_COMMITS=false or when signing failed and fell back to unsigned.',
    ),
  signingWarning: z
    .string()
    .optional()
    .describe(
      'Populated only when signing was requested but failed, and the tag was created unsigned as a fallback.',
    ),
  verifiedTag: z
    .string()
    .optional()
    .describe(
      'Verified tag name (for verify mode). Echoes the input so callers can correlate results in batched flows.',
    ),
  verified: z
    .boolean()
    .optional()
    .describe(
      'Whether the signature validated (for verify mode). `false` for unsigned tags, missing trust config, bad signatures, or unparseable output — inspect `warning` to distinguish.',
    ),
  signatureType: z
    .enum(['gpg', 'ssh', 'x509'])
    .optional()
    .describe(
      'Signature algorithm family when detectable from `git tag -v` output (verify mode). Absent for unsigned tags or unparseable output.',
    ),
  signerIdentity: z
    .string()
    .optional()
    .describe(
      'Signer identity as emitted by git — e.g., `Name <email>` for GPG or the SSH principal. Verify mode only.',
    ),
  signerKey: z
    .string()
    .optional()
    .describe(
      'Key material emitted by git — GPG fingerprint/key ID or SSH key fingerprint (`SHA256:…`). Verify mode only; absent when git did not surface it.',
    ),
  warning: z
    .string()
    .optional()
    .describe(
      'Populated on verify failure with a human-readable reason distinguishing unsigned tags, missing trust configuration, bad signatures, and unparseable output.',
    ),
  rawOutput: z
    .string()
    .optional()
    .describe(
      'Raw stderr from `git tag -v` for callers that need the full verification output (verify mode only).',
    ),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitTagLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  if (
    (input.mode === 'create' ||
      input.mode === 'delete' ||
      input.mode === 'verify') &&
    !input.tagName
  ) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Tag name is required for ${input.mode} operation.`,
    );
  }

  const tagOptions: {
    mode: 'list' | 'create' | 'delete' | 'verify';
    tagName?: string;
    commit?: string;
    message?: string;
    annotated: boolean;
    force: boolean;
    limit?: number;
  } = {
    mode: input.mode,
    annotated: input.annotated,
    force: input.force,
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
  if (input.limit !== undefined) {
    tagOptions.limit = input.limit;
  }

  const result = await provider.tag(tagOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  const output: ToolOutput = {
    success: true,
    mode: result.mode,
    tags: result.tags,
    created: result.created,
    deleted: result.deleted,
  };

  if (result.signed !== undefined) {
    output.signed = result.signed;
  }
  if (result.signingWarning) {
    output.signingWarning = result.signingWarning;
  }
  if (result.verifiedTag !== undefined) {
    output.verifiedTag = result.verifiedTag;
  }
  if (result.verified !== undefined) {
    output.verified = result.verified;
  }
  if (result.signatureType !== undefined) {
    output.signatureType = result.signatureType;
  }
  if (result.signerIdentity !== undefined) {
    output.signerIdentity = result.signerIdentity;
  }
  if (result.signerKey !== undefined) {
    output.signerKey = result.signerKey;
  }
  if (result.warning !== undefined) {
    output.warning = result.warning;
  }
  if (result.rawOutput !== undefined) {
    output.rawOutput = result.rawOutput;
  }

  return output;
}

/**
 * Filter git_tag output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success, mode, and load-bearing signing/verify outcomes
 * - standard: Above + complete tags array (list) / created/deleted name + verify details (RECOMMENDED)
 * - full: Complete output including rawOutput from `git tag -v`
 */
function filterGitTagOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // `signed`, `signingWarning`, `verified`, and `warning` always surface
  // when present — signing/verify outcomes are load-bearing.
  if (level === 'minimal') {
    return {
      success: result.success,
      mode: result.mode,
      ...(result.signed !== undefined && { signed: result.signed }),
      ...(result.signingWarning && { signingWarning: result.signingWarning }),
      ...(result.verified !== undefined && { verified: result.verified }),
      ...(result.warning && { warning: result.warning }),
    };
  }

  if (level === 'full') {
    return result;
  }

  // standard (default): everything except the noisy rawOutput stderr dump.
  const { rawOutput: _raw, ...rest } = result;
  return rest;
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
