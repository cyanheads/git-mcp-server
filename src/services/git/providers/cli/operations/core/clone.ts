/**
 * @fileoverview CLI provider git clone operation
 * @module services/git/providers/cli/operations/core/clone
 */

import { dirname, resolve } from 'node:path';

import type { RequestContext } from '@/utils/index.js';

import type {
  GitCloneOptions,
  GitCloneResult,
  GitOperationContext,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git clone to clone a repository.
 */
export async function executeClone(
  options: GitCloneOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitCloneResult> {
  try {
    // Resolve localPath to absolute so git receives an unambiguous target,
    // then derive a cwd from its parent directory — the clone destination
    // doesn't exist yet, so we can't use it as cwd (ENOENT).
    const resolvedLocalPath = resolve(
      context.workingDirectory,
      options.localPath,
    );
    const cloneCwd = dirname(resolvedLocalPath);

    const args: string[] = [options.remoteUrl, resolvedLocalPath];

    if (options.branch) {
      args.push('--branch', options.branch);
    }

    if (options.depth) {
      args.push('--depth', options.depth.toString());
    }

    if (options.bare) {
      args.push('--bare');
    }

    if (options.mirror) {
      args.push('--mirror');
    }

    if (options.recurseSubmodules) {
      args.push('--recurse-submodules');
    }

    const cmd = buildGitCommand({ command: 'clone', args });
    await execGit(cmd, cloneCwd, context.requestContext);

    const result = {
      success: true,
      localPath: options.localPath,
      remoteUrl: options.remoteUrl,
      branch: options.branch || 'main',
    };

    return result;
  } catch (error) {
    throw mapGitError(error, 'clone');
  }
}
