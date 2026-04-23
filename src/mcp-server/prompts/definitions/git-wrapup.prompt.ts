/**
 * @fileoverview Git wrap-up prompt - orchestrates the git_wrapup_instructions acceptance-criteria protocol.
 * @module src/mcp-server/prompts/definitions/git-wrapup.prompt
 */
import { z } from 'zod';

import type { PromptDefinition } from '../utils/promptDefinition.js';

const PROMPT_NAME = 'git_wrapup';
const PROMPT_DESCRIPTION =
  'Orchestrates a full git wrap-up: loads the project-aware acceptance-criteria protocol from git_wrapup_instructions, analyzes changes, satisfies each criterion per project convention, commits atomically, and (optionally) tags the release.';

const ArgumentsSchema = z.object({
  changelogPath: z
    .string()
    .optional()
    .describe(
      'Path to the changelog file when the project uses a flat one (defaults to CHANGELOG.md). The protocol itself defers to project convention.',
    ),
  createTag: z
    .string()
    .optional()
    .describe(
      "Whether to include the tag criterion in the protocol ('true' | 'false'). Defaults to 'true' — set to 'false' when tagging is deferred to a separate release step.",
    ),
});

export const gitWrapupPrompt: PromptDefinition<typeof ArgumentsSchema> = {
  name: PROMPT_NAME,
  description: PROMPT_DESCRIPTION,
  argumentsSchema: ArgumentsSchema,
  generate: (args) => {
    const changelogPath = (args.changelogPath as string) || 'CHANGELOG.md';
    const includeTag = args.createTag !== 'false';

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `You are an expert git workflow manager. Run a complete wrap-up for the current git session.

## Session Flow

1. **Load Protocol**: Call \`git_wrapup_instructions\` with \`acknowledgement: "yes"\`${includeTag ? '' : ' and `createTag: false`'}. It returns an acceptance-criteria checklist — every box must be satisfied before the wrap-up is complete — plus the current repository status.

2. **Set Working Directory**: If not already set, call \`git_set_working_dir\` to establish the session context. Required before any git operations.

3. **Analyze Changes**: Run \`git_diff\` with \`includeUntracked: true\`. Understand the "why" behind every modification end-to-end before grouping anything — the diff drives your commit plan and messages.

4. **Satisfy the Acceptance Criteria**: Work each checkbox from step 1. The protocol is strict on outcomes, generic on mechanism — follow this project's own conventions for where versions live, how the changelog is formatted (default path when flat: \`${changelogPath}\`), and what the verification suite looks like. If the root agent-instruction file (\`AGENTS.md\`, \`CLAUDE.md\`, or equivalent) documents a project-specific wrap-up procedure, that takes precedence over the generic checklist.

5. **Commit Atomically**: Use \`git_commit\` to create logical, self-contained commits in Conventional Commits form. Group related changes with the \`filesToStage\` parameter. No mixing unrelated changes in one commit.

6. **Verify Clean**: Run \`git_status\` to confirm the working tree is clean and every change is committed.${includeTag ? '\n\n7. **Tag the Release**: Create an annotated git tag with `git_tag` using semantic versioning (e.g., `v1.2.3`). The annotation message should summarize the real changes — no filler.' : ''}

## Constraints

- **Do not push** to the remote unless explicitly instructed.
- Create a task list before starting so progress is trackable.
- Do not bypass verification failures to land a green commit.
- On merge conflicts or unexpected errors: stop and surface the blocker.

Begin by calling \`git_wrapup_instructions\` and creating your task list.`,
        },
      },
    ];
  },
};
