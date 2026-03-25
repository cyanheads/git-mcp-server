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
 */
export async function executePull(
  options: GitPullOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
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
    );

    // Determine strategy
    let strategy: 'merge' | 'rebase' | 'fast-forward' = 'merge';
    if (options.rebase) {
      strategy = 'rebase';
    } else if (result.stdout.includes('Fast-forward')) {
      strategy = 'fast-forward';
    }

    // Check for conflicts
    const hasConflicts =
      result.stdout.includes('CONFLICT') || result.stderr.includes('CONFLICT');

    // Parse changed files from stat output, filtering git informational messages
    const filesChanged = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !line.includes('CONFLICT') &&
          !line.startsWith('Already up to date') &&
          !line.startsWith('From ') &&
          !line.startsWith('Your branch') &&
          !line.startsWith('(use ') &&
          !line.startsWith('Updating ') &&
          !line.startsWith('Fast-forward') &&
          !line.match(/^\d+ files? changed/),
      );

    const pullResult = {
      success: !hasConflicts,
      remote,
      branch: options.branch || 'HEAD',
      strategy,
      conflicts: hasConflicts,
      filesChanged,
    };

    return pullResult;
  } catch (error) {
    throw mapGitError(error, 'pull');
  }
}
