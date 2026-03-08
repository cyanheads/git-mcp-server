/**
 * @fileoverview Git wrap-up prompt - structured workflow for completing git sessions.
 * @module src/mcp-server/prompts/definitions/git-wrapup.prompt
 */
import { z } from 'zod';

import type { PromptDefinition } from '../utils/promptDefinition.js';

const PROMPT_NAME = 'git_wrapup';
const PROMPT_DESCRIPTION =
  'Generates a structured workflow prompt for wrapping up git sessions, including reviewing changes, updating documentation, and committing modifications. Use when the user wants to git wrapup. Unlike git_wrapup_instructions, this tool specifically handles git wrapup.';

const ArgumentsSchema = z.object({
  changelogPath: z
    .string()
    .optional()
    .describe(
      'Path to the changelog file to update (defaults to CHANGELOG.md).',
    ),
  skipDocumentation: z
    .string()
    .optional()
    .describe(
      "Whether to skip documentation review ('true' | 'false'). Defaults to 'false'.",
    ),
  createTag: z
    .string()
    .optional()
    .describe(
      "Whether to create a git tag after committing ('true' | 'false'). Defaults to 'false'.",
    ),
  updateAgentFiles: z
    .string()
    .optional()
    .describe(
      "Whether to update agent meta files like CLAUDE.md, AGENTS.md ('true' | 'false'). Defaults to 'false'.",
    ),
});

export const gitWrapupPrompt: PromptDefinition<typeof ArgumentsSchema> = {
  name: PROMPT_NAME,
  description: PROMPT_DESCRIPTION,
  argumentsSchema: ArgumentsSchema,
  generate: (args) => {
    const changelogPath = (args.changelogPath as string) || 'CHANGELOG.md';
    const skipDocumentation = args.skipDocumentation === 'true';
    const createTag = args.createTag === 'true';
    const updateAgentFiles = args.updateAgentFiles === 'true';

    const documentationSection = skipDocumentation
      ? ''
      : `\n4. **Review Documentation**: Read the README.md file and verify it accurately reflects the current codebase state. Update as necessary to maintain currency and accuracy.\n`;

    const agentFilesSection = updateAgentFiles
      ? `\n5. **Update Agent Files**: If present, review and update agent-specific meta files (CLAUDE.md, AGENTS.md, .clinerules/) to reflect any architectural or protocol changes.\n`
      : '';

    const tagSection = createTag
      ? `\nAfter all commits are complete and verified via git_status, create an annotated git tag using the git_tag tool. Use semantic versioning (e.g., v1.2.3) and include a summary of key changes in the annotation message.\n`
      : '';

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `You are an expert git workflow manager. Execute a systematic wrap-up protocol for the current git session.

## Workflow Protocol

Follow these steps in order. Do not proceed until the prior step is confirmed complete.

1. **Initialize Context**: First, call the \`git_wrapup_instructions\` tool with \`acknowledgement: "yes"\`${updateAgentFiles ? ' and `updateAgentMetaFiles: "yes"`' : ''}${createTag ? ' and `createTag: true`' : ''}. This will provide the detailed workflow instructions and current repository status.

2. **Set Working Directory**: If not already set, use \`git_set_working_dir\` to establish the session context. This is mandatory before any git operations.

3. **Analyze Changes**: Execute \`git_diff\` with \`includeUntracked: true\` to comprehensively understand all modifications. Analyze the diff output thoroughly to inform your commit strategy and messages.

4. **Update Changelog**: Read the existing \`${changelogPath}\` file. Append a new version entry at the top that:
   - Uses past tense and concise language
   - Categorizes changes (Added, Changed, Fixed, Deprecated, Removed, Security)
   - Follows the existing changelog format
   - Provides enough detail for users to understand the impact
${documentationSection}${agentFilesSection}
5. **Commit Changes**: Use \`git_commit\` to create atomic, logical commits. For each commit:
   - Group related changes together using the \`filesToStage\` parameter
   - Write commit messages following Conventional Commits format (e.g., \`feat(auth): add password reset\`, \`fix(parser): handle edge case\`)
   - Ensure commits are self-contained and buildable
   - Do not mix unrelated changes in a single commit

6. **Verify Completion**: After all commits, run \`git_status\` to confirm the working directory is clean and all changes are committed.
${tagSection}
## Important Guidelines

- **Do NOT push** to the remote repository unless explicitly instructed
- Create a task list before starting to track your progress
- Be thorough in your diff analysis - understand the "why" behind changes
- If you encounter merge conflicts or errors, stop and ask for guidance
- All commit messages must be clear, descriptive, and follow conventions
- Preserve existing code style and documentation formatting

Begin by calling \`git_wrapup_instructions\` and creating your task list.`,
        },
      },
    ];
  },
};
