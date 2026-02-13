/**
 * @fileoverview Git wrapup instructions tool - standard workflow guidance
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

const TOOL_NAME = 'git_wrapup_instructions';
const TOOL_TITLE = 'Git Wrap-up Instructions';
const TOOL_DESCRIPTION =
  "Provides the user's desired Git wrap-up workflow and instructions. Returns custom workflow steps (if configured) or default best practices for reviewing, documenting, and committing changes. Includes current repository status to guide next actions.";

const InputSchema = z.object({
  acknowledgement: z
    .enum(['Y', 'y', 'Yes', 'yes'])
    .describe('Acknowledgement to initiate the wrap-up workflow.'),
  updateAgentMetaFiles: z
    .enum(['Y', 'y', 'Yes', 'yes'])
    .optional()
    .describe('Include an instruction to update agent-specific meta files.'),
  createTag: z
    .boolean()
    .optional()
    .describe(
      'If true, instructs the agent to create a Git tag after committing all changes. Only set to true if given permission to do so.',
    ),
});

const OutputSchema = z.object({
  instructions: z
    .string()
    .describe('The set of instructions for the wrap-up workflow.'),
  gitStatus: z
    .object({
      branch: z.string().describe('Current branch name.'),
      staged: z.array(z.string()).describe('Files staged for commit.'),
      unstaged: z.array(z.string()).describe('Files with unstaged changes.'),
      untracked: z.array(z.string()).describe('Untracked files.'),
    })
    .optional()
    .describe('The current structured git status.'),
  gitStatusError: z
    .string()
    .optional()
    .describe('Any error message if getting git status failed.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

const DEFAULT_WRAPUP_INSTRUCTIONS = `
# Git Wrap-up Protocol

**Objective**: Systematically review, document, and commit all pending changes in the repository. Adherence to this protocol is mandatory.

### Phase 1: Analysis and Planning

You must begin by creating a task list that mirrors this protocol. This is your operational plan.

**Example Task List:**
\`\`\`
- [ ] Set Git working directory (if not set)
- [ ] Analyze repository changes with git_diff
- [ ] Update CHANGELOG.md with all modifications
- [ ] Review and update README.md for currency
- [ ] Commit changes in logical, atomic units
- [ ] Verify final repository status
\`\`\`

### Phase 2: Execution Workflow

Execute the following steps sequentially. Do not proceed until the prior step is confirmed complete.

1.  **Set Context**: Ensure the working directory is correctly set using **\`git_set_working_dir\`**. This is a mandatory first step.

2.  **Analyze Changes**: Execute **\`git_diff\`** with the \`includeUntracked: true\` parameter. You must thoroughly analyze the output to understand the full scope and rationale of every modification. This analysis will inform & influence your commit strategy, commit messages, and overall workflow.

3.  **Update Changelog**: Read the **\`CHANGELOG.md\`** file. Append a new version entry detailing all changes. Your entry must be concise, use the past tense, and categorize modifications (e.g., "Added," "Changed," "Fixed").

4.  **Review Documentation**: For any substantial code changes, you are required to review **\`README.md\`**. Ensure it accurately reflects the current state of the codebase. Update it as necessary.

5.  **Commit Changes**: Execute **\`git_commit\`** for each logical group of changes.
    - Commits **must be atomic** and group related changes.
    - Commit messages **must adhere** to the **Conventional Commits** standard (e.g., \`feat(auth): implement password reset\`).
    - Use the \`filesToStage\` parameter to precisely control which files are included in each commit.

**Directive**: Create your task list now. Then, execute the protocol. Do not push to the remote unless explicitly instructed.
`;

/**
 * Load custom instructions from file or use defaults
 * This is called at module initialization time to avoid file I/O on every request
 */
function loadInstructions(filePath: string | undefined): string {
  if (!filePath) {
    logger.debug('No custom instructions path configured, using default.');
    return DEFAULT_WRAPUP_INSTRUCTIONS;
  }

  try {
    const resolvedPath = path.resolve(filePath);
    logger.debug(
      `Loading custom instructions from ${resolvedPath} at module initialization`,
    );
    return readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    logger.warning(
      `Failed to load custom instructions from '${filePath}': ${errorMessage}. Falling back to default instructions.`,
    );
    return DEFAULT_WRAPUP_INSTRUCTIONS;
  }
}

// Load instructions once at module initialization (optimization)
const baseInstructions = loadInstructions(config?.git?.wrapupInstructionsPath);

async function gitWrapupInstructionsLogic(
  input: ToolInput,
  { provider, storage, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Graceful degradation for tenantId
  const tenantId = appContext.tenantId || 'default-tenant';

  // Start with base instructions loaded at module initialization
  let finalInstructions = baseInstructions;

  // Add optional instructions
  if (input.updateAgentMetaFiles) {
    finalInstructions += `\nExtra request: review and update if needed the .cline_rules and claude.md files if present.`;
  }

  if (input.createTag) {
    finalInstructions += `\n6. After all changes are committed and confirmed via 'git_status', use the 'git_tag' tool to create a new annotated tag. The tag name should follow semantic versioning (e.g., v1.2.3), and the annotation message should summarize the key changes in this wrap-up.`;
  }

  // Attempt to get current git status
  let gitStatus:
    | {
        branch: string;
        staged: string[];
        unstaged: string[];
        untracked: string[];
      }
    | undefined;
  let gitStatusError: string | undefined;

  try {
    // Check if working directory is set
    const storageKey = `session:workingDir:${tenantId}`;
    const workingDir = await storage.get<string>(storageKey, appContext);

    if (workingDir) {
      const result = await provider.status(
        { includeUntracked: true },
        {
          workingDirectory: workingDir,
          requestContext: appContext,
          tenantId,
        },
      );

      gitStatus = {
        branch: result.currentBranch || 'detached HEAD',
        staged: [
          ...(result.stagedChanges.added || []),
          ...(result.stagedChanges.modified || []),
          ...(result.stagedChanges.deleted || []),
        ],
        unstaged: [
          ...(result.unstagedChanges.modified || []),
          ...(result.unstagedChanges.deleted || []),
        ],
        untracked: result.untrackedFiles,
      };
    } else {
      gitStatusError =
        'No working directory set for session, git status skipped.';
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    gitStatusError = `Failed to get git status: ${errorMessage}`;
    logger.warning(gitStatusError, { ...appContext, error });
  }

  return {
    instructions: finalInstructions,
    gitStatus,
    gitStatusError,
  };
}

/**
 * Filter git_wrapup_instructions output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Instructions only, no git status
 * - standard: Above + complete git status (RECOMMENDED)
 * - full: Complete output (same as standard)
 */
function filterGitWrapupInstructionsOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Instructions only
  if (level === 'minimal') {
    return {
      instructions: result.instructions,
    };
  }

  // standard & full: Complete output with git status
  return result;
}

// Create JSON response formatter with verbosity filtering
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
