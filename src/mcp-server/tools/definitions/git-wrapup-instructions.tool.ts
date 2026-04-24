/**
 * @fileoverview Git wrapup instructions tool - acceptance-criteria protocol
 * @module mcp-server/tools/definitions/git-wrapup-instructions
 */
import { readFileSync } from 'fs';
import path from 'path';
import { z } from 'zod';

import { logger } from '@/utils/index.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import { config } from '@/config/index.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';
import {
  gatherRepoSnapshot,
  RepoSnapshotCommitSchema,
  RepoSnapshotStatusSchema,
  RepoSnapshotTagSchema,
} from '../utils/repo-snapshot.js';

const TOOL_NAME = 'git_wrapup_instructions';
const TOOL_TITLE = 'Git Wrap-up Instructions';
const TOOL_DESCRIPTION =
  "Returns a Git wrap-up protocol: an acceptance-criteria checklist the agent must satisfy before the session is considered shipped. Uses the operator's custom instructions if configured, otherwise emits a generic goals-strict/mechanism-generic default. Enriches the response with a repository snapshot (status, recent commits, recent tags) so the agent has immediate orientation for the commit and release steps.";

const InputSchema = z.object({
  acknowledgement: z
    .enum(['Y', 'y', 'Yes', 'yes'])
    .describe('Acknowledgement to initiate the wrap-up workflow.'),
  createTag: z
    .boolean()
    .optional()
    .describe(
      'Controls whether the tag criterion appears in the emitted protocol. Omit or set `true` to include the tag step. Set `false` to omit it entirely — e.g., when tagging is deferred to a separate release step.',
    ),
});

const OutputSchema = z.object({
  instructions: z
    .string()
    .describe('The wrap-up protocol to satisfy before the session ships.'),
  repository: z
    .object({
      status: RepoSnapshotStatusSchema,
      recentCommits: z
        .array(RepoSnapshotCommitSchema)
        .describe('Up to 2 most recent commits on the current branch.'),
      recentTags: z
        .array(RepoSnapshotTagSchema)
        .describe('Up to 2 most recent tags by creator date.'),
    })
    .optional()
    .describe(
      'Best-effort repository snapshot. Omitted when no working directory is set or when the path is not a git repository.',
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
 * Build the default wrap-up protocol from input.
 * The tag criterion is included unless `createTag` is explicitly `false`.
 */
function buildDefaultInstructions(input: ToolInput): string {
  const tagCriterion =
    input.createTag === false
      ? ''
      : "\n- [ ] Annotated tag at the project's convention (typically `v<version>`) with a concise message summarizing the real changes — no filler. Flag if a tag already exists at this commit.";

  return `# Git Wrap-up

**Outcome**: a new release — version bumped, changes documented and verified, committed atomically, and tagged.

**Philosophy**: strict on goals, generic on mechanism. The acceptance checkboxes are fixed; everything beneath them is guidance that defers to project convention.

## Orient

Before touching git, read the project. Check the root agent-instruction file (\`AGENTS.md\`, \`CLAUDE.md\`, or equivalent) for wrap-up expectations, version locations, and any bespoke checklist. Identify:

- how changes are recorded (flat changelog, directory-based, release-notes tooling, or none)
- where versions are declared (manifest, server descriptor, \`VERSION\` file, tag-driven, or embedded in docs)
- what verification looks like (the project's check-suite, which may be a single combined command or several run in sequence)
- what mirrors version or structure (badges, generated docs, agent-instruction files, templated files)

If the project documents its own wrap-up procedure, follow it — the checklist below is the baseline, not an override.

## Acceptance criteria

A wrap-up is complete when every checkbox is satisfied. Every wrap-up is a release: minimum patch bump unless the change warrants minor or major.

- [ ] Full diff reviewed end-to-end before commits are planned
- [ ] Version bumped per semver (default patch; minor/major when warranted) across every place the project declares it — manifest, server descriptor, badges, agent-instruction files, templated mirrors
- [ ] Changelog updated under the new version in the project's existing format, or created conventionally if none exists
- [ ] Documentation that references changed behaviour is current
- [ ] Verification suite passes against the tree being committed
- [ ] Commits are atomic and in Conventional Commits form${tagCriterion}

**Commonly relevant files** (check these if present; exact names vary by project):

- **Documentation**: \`README.md\`, generated structure docs like \`docs/tree.md\`, and any usage or reference docs affected by the change.
- **Agent-instruction files**: \`AGENTS.md\`, \`CLAUDE.md\`, or equivalents — if the code changes alter anything these files describe (architecture, available tools, conventions, file layout), update them to match. If they are symlinked or mirrored, edit the source; the link or mirror reflects automatically.
- **Version sources**: manifests (\`package.json\`, \`pyproject.toml\`, \`Cargo.toml\`), server descriptors (\`server.json\`), \`VERSION\` files — bump in lockstep.

**Style defaults** (overridable by project convention):

- Cross-reference issues and PRs with full URLs — \`[#42](https://github.com/owner/repo/pull/42)\` or \`owner/repo#42\`. Bare \`#42\` breaks outside the GitHub web UI.
- Commit and changelog entries lead with specifics — name the tool, service, or module affected in the first few words.

## Constraints

- Do not push to the remote unless explicitly instructed.
- Do not bypass verification failures to land a green commit.
- Do not rewrite published history.
`;
}

/**
 * Load custom instructions from file. Returns null when no path is configured
 * or the file could not be read. Called once at module initialization.
 */
function loadCustomInstructions(filePath: string | undefined): string | null {
  if (!filePath) {
    logger.debug(
      'No custom wrap-up instructions configured; using built-in default.',
    );
    return null;
  }

  try {
    const resolvedPath = path.resolve(filePath);
    logger.debug(
      `Loading custom wrap-up instructions from ${resolvedPath} at module initialization.`,
    );
    return readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    logger.warning(
      `Failed to load custom wrap-up instructions from '${filePath}': ${errorMessage}. Falling back to built-in default.`,
    );
    return null;
  }
}

const customInstructions = loadCustomInstructions(
  config?.git?.wrapupInstructionsPath,
);

async function gitWrapupInstructionsLogic(
  input: ToolInput,
  { provider, storage, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const tenantId = appContext.tenantId || 'default-tenant';
  const finalInstructions =
    customInstructions ?? buildDefaultInstructions(input);

  const storageKey = `session:workingDir:${tenantId}`;
  const workingDir = await storage.get<string>(storageKey, appContext);

  if (!workingDir) {
    return {
      instructions: finalInstructions,
      enrichmentWarnings: [
        'No session working directory set. Call git_set_working_dir first to include a repository snapshot (status, recent commits, recent tags) in this response.',
      ],
    };
  }

  const { snapshot, warnings } = await gatherRepoSnapshot(
    { provider, appContext, workingDirectory: workingDir },
    { commitLimit: 2, tagLimit: 2 },
  );

  return {
    instructions: finalInstructions,
    ...(snapshot
      ? {
          repository: {
            status: snapshot.status,
            recentCommits: snapshot.recentCommits,
            recentTags: snapshot.recentTags,
          },
        }
      : {}),
    ...(warnings.length > 0 ? { enrichmentWarnings: warnings } : {}),
  };
}

/**
 * Filter git_wrapup_instructions output based on verbosity level.
 *
 * - minimal: instructions only
 * - standard/full: instructions + repository snapshot + warnings
 */
function filterGitWrapupInstructionsOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  if (level === 'minimal') {
    return { instructions: result.instructions };
  }
  return result;
}

const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitWrapupInstructionsOutput,
});

export const gitWrapupInstructionsTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(
    ['tool:git:read'],
    createToolHandler(gitWrapupInstructionsLogic, { skipPathResolution: true }),
  ),
  responseFormatter,
};
