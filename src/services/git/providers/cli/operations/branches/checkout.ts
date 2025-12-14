/**
 * @fileoverview Git checkout operations
 * @module services/git/providers/cli/operations/branches/checkout
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitCheckoutOptions,
  GitCheckoutResult,
  GitOperationContext,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git checkout to switch branches or restore files.
 */
export async function executeCheckout(
  options: GitCheckoutOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitCheckoutResult> {
  try {
    const args: string[] = [];

    if (options.createBranch) {
      args.push('-b', options.target);
      // --track sets up tracking when creating a branch
      if (options.track) {
        args.push('--track');
      }
    } else {
      args.push(options.target);
    }

    if (options.force) {
      args.push('--force');
    }

    if (options.paths && options.paths.length > 0) {
      args.push('--', ...options.paths);
    }

    const cmd = buildGitCommand({ command: 'checkout', args });
    const result = await execGit(
      cmd,
      context.workingDirectory,
      context.requestContext,
    );

    // Parse modified files from output
    const filesModified = result.stdout
      .split('\n')
      .filter(
        (line) =>
          line.trim() &&
          !line.startsWith('Switched') &&
          !line.startsWith('Already'),
      )
      .map((line) => line.trim());

    const checkoutResult = {
      success: true,
      target: options.target,
      branchCreated: options.createBranch || false,
      filesModified,
    };

    return checkoutResult;
  } catch (error) {
    throw mapGitError(error, 'checkout');
  }
}
