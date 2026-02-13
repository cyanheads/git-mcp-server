/**
 * @fileoverview Barrel file for all tool definitions.
 * This file re-exports all tool definitions for easy import and registration.
 * It also exports an array of all definitions for automated registration.
 * @module src/mcp-server/tools/definitions
 */

// Git tools - Analysis
import { gitChangelogAnalyzeTool } from './git-changelog-analyze.tool.js';

// Git tools - Core
import { gitBlameTool } from './git-blame.tool.js';
import { gitCleanTool } from './git-clean.tool.js';
import { gitClearWorkingDirTool } from './git-clear-working-dir.tool.js';
import { gitCloneTool } from './git-clone.tool.js';
import { gitInitTool } from './git-init.tool.js';
import { gitReflogTool } from './git-reflog.tool.js';
import { gitSetWorkingDirTool } from './git-set-working-dir.tool.js';
import { gitStatusTool } from './git-status.tool.js';
import { gitWrapupInstructionsTool } from './git-wrapup-instructions.tool.js';

// Git tools - Staging & Commits
import { gitAddTool } from './git-add.tool.js';
import { gitCommitTool } from './git-commit.tool.js';
import { gitDiffTool } from './git-diff.tool.js';
import { gitLogTool } from './git-log.tool.js';
import { gitShowTool } from './git-show.tool.js';

// Git tools - Branching & Merging
import { gitBranchTool } from './git-branch.tool.js';
import { gitCheckoutTool } from './git-checkout.tool.js';
import { gitCherryPickTool } from './git-cherry-pick.tool.js';
import { gitMergeTool } from './git-merge.tool.js';
import { gitRebaseTool } from './git-rebase.tool.js';

// Git tools - Remote Operations
import { gitFetchTool } from './git-fetch.tool.js';
import { gitPullTool } from './git-pull.tool.js';
import { gitPushTool } from './git-push.tool.js';
import { gitRemoteTool } from './git-remote.tool.js';

// Git tools - Advanced Workflows
import { gitResetTool } from './git-reset.tool.js';
import { gitStashTool } from './git-stash.tool.js';
import { gitTagTool } from './git-tag.tool.js';
import { gitWorktreeTool } from './git-worktree.tool.js';

/**
 * An array containing all tool definitions for easy iteration.
 * Alphabetized by tool name for maintainability.
 */
export const allToolDefinitions = [
  gitAddTool,
  gitBlameTool,
  gitBranchTool,
  gitChangelogAnalyzeTool,
  gitCheckoutTool,
  gitCherryPickTool,
  gitCleanTool,
  gitClearWorkingDirTool,
  gitCloneTool,
  gitCommitTool,
  gitDiffTool,
  gitFetchTool,
  gitInitTool,
  gitLogTool,
  gitMergeTool,
  gitPullTool,
  gitPushTool,
  gitRebaseTool,
  gitReflogTool,
  gitRemoteTool,
  gitResetTool,
  gitSetWorkingDirTool,
  gitShowTool,
  gitStashTool,
  gitStatusTool,
  gitTagTool,
  gitWorktreeTool,
  gitWrapupInstructionsTool,
];
