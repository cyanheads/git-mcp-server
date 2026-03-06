/**
 * @fileoverview CLI provider git add operation
 * @module services/git/providers/cli/operations/staging/add
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitAddOptions,
  GitAddResult,
  GitOperationContext,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git add to stage changes.
 */
export async function executeAdd(
  options: GitAddOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitAddResult> {
  try {
    const args: string[] = [];

    if (options.all) {
      args.push('--all');
    } else if (options.update) {
      args.push('--update');
    } else if (options.paths.length > 0) {
      args.push(...options.paths);
    }

    if (options.force) {
      args.push('--force');
    }

    const cmd = buildGitCommand({ command: 'add', args });
    await execGit(cmd, context.workingDirectory, context.requestContext);

    // When --all or --update is used, we don't know the actual files staged.
    // Only report paths when explicit paths were provided.
    const stagedFiles =
      options.all || options.update ? [] : options.paths;

    const result = {
      success: true,
      stagedFiles,
    };

    return result;
  } catch (error) {
    throw mapGitError(error, 'add');
  }
}
