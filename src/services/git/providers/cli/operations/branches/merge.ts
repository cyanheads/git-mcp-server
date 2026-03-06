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
 */
export async function executeMerge(
  options: GitMergeOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
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

      // Add signing support - use explicit option or fall back to config default
      const shouldSign = options.sign ?? shouldSignCommits();

      if (shouldSign) {
        args.push('-S');
      }

      args.push(options.branch);
    }

    const cmd = buildGitCommand({ command: 'merge', args });
    const result = await execGit(
      cmd,
      context.workingDirectory,
      context.requestContext,
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

    // Check for conflicts and fast-forward
    const hasConflicts =
      result.stdout.includes('CONFLICT') || result.stderr.includes('CONFLICT');
    const isFastForward = result.stdout.includes('Fast-forward');

    // Parse conflicted files
    const conflictedFiles = result.stdout
      .split('\n')
      .filter((line) => line.includes('CONFLICT'))
      .map((line) => {
        const match = line.match(/CONFLICT.*?in (.+)$/);
        return match?.[1] || '';
      })
      .filter((f) => f);

    // Parse merged files from diffstat lines (e.g., " file.txt | 5 +++++")
    const mergedFiles = result.stdout
      .split('\n')
      .map((line) => {
        const statMatch = line.match(/^\s*(.+?)\s*\|\s*\d+/);
        return statMatch?.[1]?.trim() || '';
      })
      .filter((f) => f);

    const mergeResult = {
      success: !hasConflicts,
      strategy: options.strategy || 'ort',
      fastForward: isFastForward,
      conflicts: hasConflicts,
      conflictedFiles,
      mergedFiles,
      message: options.message || result.stdout.trim(),
    };

    return mergeResult;
  } catch (error) {
    throw mapGitError(error, 'merge');
  }
}
