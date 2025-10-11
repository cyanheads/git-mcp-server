/**
 * @fileoverview Git cherry-pick operations
 * @module services/git/providers/cli/operations/branches/cherry-pick
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitCherryPickOptions,
  GitCherryPickResult,
  GitOperationContext,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git cherry-pick to apply commits.
 */
export async function executeCherryPick(
  options: GitCherryPickOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitCherryPickResult> {
  try {
    const args: string[] = [];

    if (options.abort) {
      args.push('--abort');
    } else if (options.continueOperation) {
      args.push('--continue');
    } else {
      args.push(...options.commits);

      if (options.noCommit) {
        args.push('--no-commit');
      }
    }

    const cmd = buildGitCommand({ command: 'cherry-pick', args });
    const result = await execGit(
      cmd,
      context.workingDirectory,
      context.requestContext,
    );

    const hasConflicts =
      result.stdout.includes('CONFLICT') || result.stderr.includes('CONFLICT');

    // Parse conflicted files
    const conflictedFiles = result.stdout
      .split('\n')
      .filter((line) => line.includes('CONFLICT'))
      .map((line) => {
        const match = line.match(/CONFLICT.*?in (.+)$/);
        return match?.[1] || '';
      })
      .filter((f) => f);

    const cherryPickResult = {
      success: !hasConflicts,
      pickedCommits:
        options.abort || options.continueOperation ? [] : options.commits,
      conflicts: hasConflicts,
      conflictedFiles,
    };

    return cherryPickResult;
  } catch (error) {
    throw mapGitError(error, 'cherry-pick');
  }
}
