/**
 * @fileoverview Git merge operations
 * @module services/git/providers/cli/operations/branches/merge
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitMergeOptions,
  GitMergeResult,
  GitOperationContext,
} from '../../../../types.js';
import {
  buildGitCommand,
  mapGitError,
  shouldSignCommits,
} from '../../utils/index.js';

/**
 * Execute git merge to integrate changes.
 *
 * A merge that exits non-zero solely because of a CONFLICT is **not** an error
 * — it's a documented success state with a populated `conflictedFiles` list.
 * We pass `allowNonZeroExit` so we can inspect git's output and surface the
 * conflict via the structured result. Genuine failures (no CONFLICT marker
 * in stdout/stderr) still throw.
 */
export async function executeMerge(
  options: GitMergeOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
    options?: { allowNonZeroExit?: boolean },
  ) => Promise<{ stdout: string; stderr: string; exitCode?: number }>,
): Promise<GitMergeResult> {
  try {
    const args: string[] = [];

    if (options.abort) {
      args.push('--abort');
    } else {
      if (options.noFastForward) {
        args.push('--no-ff');
      }

      if (options.strategy) {
        args.push(`--strategy=${options.strategy}`);
      }

      if (options.squash) {
        args.push('--squash');
      }

      if (options.message) {
        args.push('-m', options.message);
      }

      if (shouldSignCommits()) {
        args.push('-S');
      }

      args.push(options.branch);
    }

    const cmd = buildGitCommand({ command: 'merge', args });
    const result = await execGit(
      cmd,
      context.workingDirectory,
      context.requestContext,
      { allowNonZeroExit: true },
    );

    if (options.abort) {
      return {
        success: true,
        strategy: 'ort',
        fastForward: false,
        conflicts: false,
        conflictedFiles: [],
        mergedFiles: [],
        message: 'Merge aborted.',
      };
    }

    const hasConflicts =
      result.stdout.includes('CONFLICT') || result.stderr.includes('CONFLICT');
    const exitCode = result.exitCode ?? 0;

    // Non-zero exit without a CONFLICT marker means a real failure
    // (bad ref, dirty working tree, merge tool config error, etc.).
    if (exitCode !== 0 && !hasConflicts) {
      throw new Error(
        `Exit Code: ${exitCode}\nStderr: ${result.stderr}\nStdout: ${result.stdout}`,
      );
    }

    const isFastForward = result.stdout.includes('Fast-forward');

    const conflictedFiles = parseConflictedFiles(
      `${result.stdout}\n${result.stderr}`,
    );

    // Parse merged files from diffstat lines (e.g., " file.txt | 5 +++++" or " img.png | Bin 0 -> 1234 bytes")
    const mergedFiles = result.stdout
      .split('\n')
      .map((line) => {
        const statMatch = line.match(/^\s(.+?)\s*\|\s*(?:\d+\s*[+-]*|Bin\s)/);
        return statMatch?.[1]?.trim() || '';
      })
      .filter((f) => f);

    const mergeResult: GitMergeResult = {
      success: true,
      strategy: options.strategy || 'ort',
      fastForward: isFastForward,
      conflicts: hasConflicts,
      conflictedFiles,
      mergedFiles,
      message: hasConflicts
        ? `Merge of '${options.branch}' produced conflicts in ${conflictedFiles.length} file(s). Resolve with git_add + git_commit, or pass abort=true to cancel.`
        : options.message || result.stdout.trim(),
    };

    return mergeResult;
  } catch (error) {
    throw mapGitError(error, 'merge');
  }
}

/**
 * Extract file paths from `CONFLICT (...) in <path>` lines.
 * Deduplicates because git can emit the same file across stdout and stderr.
 */
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
