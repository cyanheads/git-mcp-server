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
      const continueCmd = buildGitCommand({
        command: 'rebase',
        args: ['--continue'],
      });
      await execGit(
        continueCmd,
        context.workingDirectory,
        context.requestContext,
      );
      return {
        success: true,
        conflicts: false,
        conflictedFiles: [],
        rebasedCommits: 0,
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

      // Positional args must come after flags
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
    // Modern git (merge backend) doesn't output "Applying:" lines.
    // Look for "Rebasing (N/M)" progress lines or "Successfully rebased" summary.
    let rebasedCommits = 0;
    const progressLines = result.stderr
      .split('\n')
      .filter((line) => /Rebasing \(\d+\/\d+\)/.test(line));
    if (progressLines.length > 0) {
      // Extract the total from the last progress line "Rebasing (N/M)"
      const lastProgress = progressLines.at(-1)!;
      const progressMatch = lastProgress.match(/Rebasing \((\d+)\/(\d+)\)/);
      if (progressMatch) {
        rebasedCommits = parseInt(progressMatch[2]!, 10);
      }
    } else {
      // Fallback: legacy apply backend uses "Applying:" lines
      rebasedCommits = result.stdout
        .split('\n')
        .filter((line) => line.startsWith('Applying:')).length;
    }

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
