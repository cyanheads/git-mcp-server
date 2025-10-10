/**
 * @fileoverview CLI provider git fetch operation
 * @module services/git/providers/cli/operations/remotes/fetch
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitFetchOptions,
  GitFetchResult,
  GitOperationContext,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git fetch to download remote changes.
 */
export async function executeFetch(
  options: GitFetchOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitFetchResult> {
  try {
    const args: string[] = [];
    const remote = options.remote || 'origin';

    args.push(remote);

    if (options.prune) {
      args.push('--prune');
    }

    if (options.tags) {
      args.push('--tags');
    }

    if (options.depth) {
      args.push(`--depth=${options.depth}`);
    }

    const cmd = buildGitCommand({ command: 'fetch', args });
    const gitOutput = await execGit(
      cmd,
      context.workingDirectory,
      context.requestContext,
    );

    // Parse fetched and pruned refs from output
    const fetchedRefs: string[] = [];
    const prunedRefs: string[] = [];

    const lines = gitOutput.stderr.split('\n'); // git fetch outputs to stderr
    for (const line of lines) {
      if (line.includes('->')) {
        const match = line.match(/\*\s+\[new branch\]\s+(\S+)/);
        if (match) {
          fetchedRefs.push(match[1]!);
        }
      }
      if (line.includes('pruned')) {
        const match = line.match(/x\s+\[deleted\]\s+.*?\s+(\S+)/);
        if (match) {
          prunedRefs.push(match[1]!);
        }
      }
    }

    const result = {
      success: true,
      remote,
      fetchedRefs,
      prunedRefs,
    };

    return result;
  } catch (error) {
    throw mapGitError(error, 'fetch');
  }
}
