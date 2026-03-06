/**
 * @fileoverview Git rebase operations
 * @module services/git/providers/cli/operations/branches/rebase
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitRebaseOptions,
  GitRebaseResult,
} from '../../../../types.js';
import {
  buildGitCommand,
  mapGitError,
  shouldSignCommits,
} from '../../utils/index.js';

/**
 * Execute git rebase to reapply commits.
 */
export async function executeRebase(
  options: GitRebaseOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitRebaseResult> {
  try {
    const args: string[] = [];

    // Handle mode-based operations
    const mode = options.mode || 'start';

    if (mode === 'continue') {
      try {
        const continueCmd = buildGitCommand({
          command: 'rebase',
          args: ['--continue', '--no-edit'],
        });
        await execGit(
          continueCmd,
          context.workingDirectory,
          context.requestContext,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("unknown option `no-edit'")
        ) {
          const continueCmd = buildGitCommand({
            command: 'rebase',
            args: ['--continue'],
          });
          await execGit(
            continueCmd,
            context.workingDirectory,
            context.requestContext,
          );
        } else {
          // Re-throw other errors
          throw error;
        }
      }
      // Since the rebase is now handled within this block, we can return early
      return {
        success: true,
        conflicts: false,
        conflictedFiles: [],
        rebasedCommits: 1, // Assuming success
      };
    } else if (mode === 'abort') {
      args.push('--abort');
    } else if (mode === 'skip') {
      args.push('--skip');
    } else {
      // Start mode - requires upstream
      if (!options.upstream) {
        throw new Error('upstream is required for start mode');
      }

      if (options.onto) {
        args.push('--onto', options.onto, options.upstream);
        if (options.branch) {
          args.push(options.branch);
        }
      } else {
        args.push(options.upstream);
        if (options.branch) {
          args.push(options.branch);
        }
      }

      if (options.interactive) {
        args.push('--interactive');
      }

      if (options.preserve) {
        args.push('--preserve-merges');
      }

      // Add signing support for rebased commits - use explicit option or fall back to config default
      const shouldSign = options.sign ?? shouldSignCommits();

      if (shouldSign) {
        args.push('--gpg-sign');
      }
    }

    const cmd = buildGitCommand({ command: 'rebase', args });
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

    // Count rebased commits from output
    // Git outputs "Successfully rebased and updated ..." or individual "Applying: ..." lines
    const applyingLines = result.stdout
      .split('\n')
      .filter((line) => line.startsWith('Applying:'));
    const rebasedCommits = applyingLines.length;

    const rebaseResult = {
      success: !hasConflicts,
      conflicts: hasConflicts,
      conflictedFiles,
      rebasedCommits,
    };

    return rebaseResult;
  } catch (error) {
    throw mapGitError(error, 'rebase');
  }
}
