/**
 * @fileoverview CLI provider git reset operation
 * @module services/git/providers/cli/operations/staging/reset
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitResetOptions,
  GitResetResult,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git reset to move HEAD and optionally modify index/working tree.
 *
 * @param options - Reset options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Reset result
 */
export async function executeReset(
  options: GitResetOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitResetResult> {
  try {
    const args: string[] = [];

    // Add mode flag
    switch (options.mode) {
      case 'soft':
        args.push('--soft');
        break;
      case 'mixed':
        args.push('--mixed');
        break;
      case 'hard':
        args.push('--hard');
        break;
      case 'merge':
        args.push('--merge');
        break;
      case 'keep':
        args.push('--keep');
        break;
    }

    // Add commit to reset to
    if (options.commit) {
      args.push(options.commit);
    }

    // Add paths if specified
    if (options.paths && options.paths.length > 0) {
      args.push('--', ...options.paths);
    }

    const cmd = buildGitCommand({ command: 'reset', args });
    await execGit(cmd, context.workingDirectory, context.requestContext);

    // Get the current commit hash after reset
    const hashCmd = buildGitCommand({
      command: 'rev-parse',
      args: ['HEAD'],
    });
    const hashResult = await execGit(
      hashCmd,
      context.workingDirectory,
      context.requestContext,
    );

    const result = {
      success: true,
      mode: options.mode,
      commit: hashResult.stdout.trim(),
      filesReset: options.paths || [],
    };

    return result;
  } catch (error) {
    throw mapGitError(error, 'reset');
  }
}
