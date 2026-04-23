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
 *
 * A rebase that exits non-zero solely because of a CONFLICT is a documented
 * success state with conflicted files to resolve, not a failure. We pass
 * `allowNonZeroExit` so the conflict info can be returned structurally and
 * the agent can act on it (resolve + continue, or abort).
 */
export async function executeRebase(
  options: GitRebaseOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
    options?: { allowNonZeroExit?: boolean },
  ) => Promise<{ stdout: string; stderr: string; exitCode?: number }>,
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
      const continueResult = await execGit(
        continueCmd,
        context.workingDirectory,
        context.requestContext,
        { allowNonZeroExit: true },
      );
      const continueHasConflicts =
        continueResult.stdout.includes('CONFLICT') ||
        continueResult.stderr.includes('CONFLICT');
      const continueExit = continueResult.exitCode ?? 0;
      if (continueExit !== 0 && !continueHasConflicts) {
        throw new Error(
          `Exit Code: ${continueExit}\nStderr: ${continueResult.stderr}\nStdout: ${continueResult.stdout}`,
        );
      }
      return {
        success: true,
        conflicts: continueHasConflicts,
        conflictedFiles: parseConflictedFiles(
          `${continueResult.stdout}\n${continueResult.stderr}`,
        ),
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

      if (shouldSignCommits()) {
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
      { allowNonZeroExit: true },
    );

    const hasConflicts =
      result.stdout.includes('CONFLICT') || result.stderr.includes('CONFLICT');
    const exitCode = result.exitCode ?? 0;

    if (exitCode !== 0 && !hasConflicts) {
      throw new Error(
        `Exit Code: ${exitCode}\nStderr: ${result.stderr}\nStdout: ${result.stdout}`,
      );
    }

    const conflictedFiles = parseConflictedFiles(
      `${result.stdout}\n${result.stderr}`,
    );

    // Count rebased commits from output.
    // Modern git (merge backend) doesn't output "Applying:" lines —
    // it emits "Rebasing (N/M)" progress lines instead.
    let rebasedCommits = 0;
    const progressLines = result.stderr
      .split('\n')
      .filter((line) => /Rebasing \(\d+\/\d+\)/.test(line));
    if (progressLines.length > 0) {
      const lastProgress = progressLines.at(-1)!;
      const progressMatch = lastProgress.match(/Rebasing \((\d+)\/(\d+)\)/);
      if (progressMatch) {
        rebasedCommits = parseInt(progressMatch[2]!, 10);
      }
    } else {
      // Legacy apply backend uses "Applying:" lines
      rebasedCommits = result.stdout
        .split('\n')
        .filter((line) => line.startsWith('Applying:')).length;
    }

    const rebaseResult: GitRebaseResult = {
      success: true,
      conflicts: hasConflicts,
      conflictedFiles,
      rebasedCommits,
    };

    return rebaseResult;
  } catch (error) {
    throw mapGitError(error, 'rebase');
  }
}

function parseConflictedFiles(combined: string): string[] {
  const seen = new Set<string>();
  for (const line of combined.split('\n')) {
    const match = line.match(/CONFLICT.*?\sin\s(.+?)\s*$/);
    if (match?.[1]) {
      seen.add(match[1].trim());
    }
  }
  return [...seen];
}
