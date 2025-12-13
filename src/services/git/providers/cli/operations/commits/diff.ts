/**
 * @fileoverview CLI provider git diff operation
 * @module services/git/providers/cli/operations/commits/diff
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitDiffOptions,
  GitDiffResult,
  GitOperationContext,
} from '../../../../types.js';
import {
  buildGitCommand,
  mapGitError,
  parseGitDiffStat,
} from '../../utils/index.js';

/**
 * Execute git diff to show changes.
 *
 * @param options - Diff options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Diff result
 */
export async function executeDiff(
  options: GitDiffOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitDiffResult> {
  try {
    const args: string[] = [];

    // Add flags first (before commits/paths)
    if (options.staged) {
      args.push('--cached');
    }

    if (options.nameOnly) {
      args.push('--name-only');
    }

    if (options.unified !== undefined) {
      args.push(`--unified=${options.unified}`);
    }

    // Add commit refs
    if (options.commit1) {
      args.push(options.commit1);
    }

    if (options.commit2) {
      args.push(options.commit2);
    }

    // Add path filter last (after --)
    if (options.path) {
      args.push('--', options.path);
    }

    // If stat-only mode requested, just return stat output
    if (options.stat) {
      const statCmd = buildGitCommand({
        command: 'diff',
        args: [...args.filter((a) => a !== '--name-only'), '--stat'],
      });
      const statResult = await execGit(
        statCmd,
        context.workingDirectory,
        context.requestContext,
      );
      const stats = parseGitDiffStat(statResult.stdout);

      return {
        diff: statResult.stdout,
        filesChanged: stats.files.length,
        insertions: stats.totalAdditions,
        deletions: stats.totalDeletions,
        binary: statResult.stdout.includes('Binary files'),
      };
    }

    // Get diff content
    const diffCmd = buildGitCommand({ command: 'diff', args });
    const diffResult = await execGit(
      diffCmd,
      context.workingDirectory,
      context.requestContext,
    );

    // If includeUntracked, get untracked files and append their diff
    let untrackedDiff = '';
    let untrackedFileCount = 0;
    if (options.includeUntracked) {
      // Get list of untracked files
      const lsFilesCmd = buildGitCommand({
        command: 'ls-files',
        args: ['--others', '--exclude-standard'],
      });
      const lsFilesResult = await execGit(
        lsFilesCmd,
        context.workingDirectory,
        context.requestContext,
      );

      const untrackedFiles = lsFilesResult.stdout
        .split('\n')
        .filter((f) => f.trim());
      untrackedFileCount = untrackedFiles.length;

      // Generate diff for each untracked file (show as new file)
      for (const file of untrackedFiles) {
        if (options.nameOnly) {
          untrackedDiff += `${file}\n`;
        } else {
          // Use git diff --no-index to show untracked file as new
          // Note: git diff --no-index exits with 1 when files differ, which is expected
          try {
            const untrackedCmd = buildGitCommand({
              command: 'diff',
              args: ['--no-index', '/dev/null', file],
            });
            const result = await execGit(
              untrackedCmd,
              context.workingDirectory,
              context.requestContext,
            );
            untrackedDiff += result.stdout;
          } catch (err: unknown) {
            // git diff --no-index exits with code 1 when files differ
            // The error message format is: "Exit Code: N\nStderr: ...\nStdout: ..."
            if (err instanceof Error) {
              const stdoutMatch = err.message.match(/\nStdout: ([\s\S]*)$/);
              if (stdoutMatch?.[1]) {
                untrackedDiff += stdoutMatch[1];
              }
            }
          }
        }
      }
    }

    // Combine tracked and untracked diffs
    const combinedDiff = diffResult.stdout + untrackedDiff;

    // For name-only mode, count files from output
    if (options.nameOnly) {
      const files = combinedDiff.split('\n').filter((line) => line.trim());
      return {
        diff: combinedDiff,
        filesChanged: files.length,
        binary: false,
      };
    }

    // Get diff stats for full diff mode
    const baseArgs = args.filter((a) => a !== '--name-only');
    const statCmd = buildGitCommand({
      command: 'diff',
      args: [...baseArgs, '--stat'],
    });
    const statResult = await execGit(
      statCmd,
      context.workingDirectory,
      context.requestContext,
    );

    const stats = parseGitDiffStat(statResult.stdout);
    const hasBinary = combinedDiff.includes('Binary files');

    return {
      diff: combinedDiff,
      filesChanged: stats.files.length + untrackedFileCount,
      insertions: stats.totalAdditions,
      deletions: stats.totalDeletions,
      binary: hasBinary,
    };
  } catch (error) {
    throw mapGitError(error, 'diff');
  }
}
