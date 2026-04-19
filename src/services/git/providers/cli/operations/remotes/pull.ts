/**
 * @fileoverview CLI provider git pull operation
 * @module services/git/providers/cli/operations/remotes/pull
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitPullOptions,
  GitPullResult,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git pull to fetch and integrate remote changes.
 *
 * A pull that exits non-zero solely because of a CONFLICT is a documented
 * success state with conflicted files to resolve, not a failure. We pass
 * `allowNonZeroExit` so the conflict info can be returned structurally.
 */
export async function executePull(
  options: GitPullOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
    options?: { allowNonZeroExit?: boolean },
  ) => Promise<{ stdout: string; stderr: string; exitCode?: number }>,
): Promise<GitPullResult> {
  try {
    const args: string[] = [];
    const remote = options.remote || 'origin';

    args.push(remote);

    if (options.branch) {
      args.push(options.branch);
    }

    if (options.rebase) {
      args.push('--rebase');
    }

    if (options.fastForwardOnly) {
      args.push('--ff-only');
    }

    const cmd = buildGitCommand({ command: 'pull', args });
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

    let strategy: 'merge' | 'rebase' | 'fast-forward' = 'merge';
    if (options.rebase) {
      strategy = 'rebase';
    } else if (result.stdout.includes('Fast-forward')) {
      strategy = 'fast-forward';
    }

    const conflictedFiles = parseConflictedFiles(
      `${result.stdout}\n${result.stderr}`,
    );
    const filesChanged = parseFilesChanged(result.stdout);

    return {
      success: true,
      remote,
      branch: options.branch || 'HEAD',
      strategy,
      conflicts: hasConflicts,
      conflictedFiles,
      filesChanged,
    };
  } catch (error) {
    throw mapGitError(error, 'pull');
  }
}

/** Extract paths from `CONFLICT (...) in <path>` lines, deduplicated. */
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

/**
 * Parse changed file paths from `git pull`'s diffstat lines.
 *
 * Diffstat format: ` <path> | <count> <symbols>` or ` <path> | Bin <a> -> <b>`.
 * Returns the bare path without stats; informational lines are skipped.
 */
function parseFilesChanged(stdout: string): string[] {
  const files: string[] = [];
  for (const line of stdout.split('\n')) {
    const statMatch = line.match(/^\s(.+?)\s*\|\s*(?:\d+\s*[+-]*|Bin\s)/);
    if (statMatch?.[1]) {
      files.push(statMatch[1].trim());
    }
  }
  return files;
}
