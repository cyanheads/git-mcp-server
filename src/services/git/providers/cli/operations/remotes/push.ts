/**
 * @fileoverview CLI provider git push operation
 * @module services/git/providers/cli/operations/remotes/push
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitPushOptions,
  GitPushResult,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git push to upload local changes.
 */
export async function executePush(
  options: GitPushOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitPushResult> {
  try {
    const args: string[] = [];
    const remote = options.remote || 'origin';

    if (options.delete) {
      if (!options.branch && !options.remoteBranch) {
        throw new Error(
          'A branch or remote branch name is required for delete operations.',
        );
      }
      args.push('--delete');
    }

    args.push(remote);

    if (options.branch) {
      // Build refspec: local:remote when remoteBranch differs from local
      if (options.remoteBranch && options.remoteBranch !== options.branch) {
        args.push(`${options.branch}:${options.remoteBranch}`);
      } else {
        args.push(options.branch);
      }
    } else if (options.remoteBranch) {
      // remoteBranch without local branch — push HEAD to the remote branch
      args.push(`HEAD:${options.remoteBranch}`);
    }

    if (options.force) {
      args.push('--force');
    } else if (options.forceWithLease) {
      args.push('--force-with-lease');
    }

    if (options.setUpstream) {
      args.push('--set-upstream');
    }

    if (options.tags) {
      args.push('--tags');
    }

    if (options.dryRun) {
      args.push('--dry-run');
    }

    const cmd = buildGitCommand({ command: 'push', args });
    const gitOutput = await execGit(
      cmd,
      context.workingDirectory,
      context.requestContext,
    );

    // Parse pushed and rejected refs
    const pushedRefs: string[] = [];
    const rejectedRefs: string[] = [];

    const lines = gitOutput.stderr.split('\n'); // git push outputs to stderr
    for (const line of lines) {
      if (line.includes('->')) {
        // Match both new branch and normal push lines:
        //   * [new branch]      main -> main
        //   abc1234..def5678    main -> main
        const refMatch = line.match(/\s+(\S+)\s+->\s+(\S+)/);
        if (refMatch) {
          pushedRefs.push(refMatch[2]!);
        }
      }
      if (line.includes('rejected')) {
        const match = line.match(/!\s+\[rejected\]\s+(\S+)/);
        if (match) {
          rejectedRefs.push(match[1]!);
        }
      }
    }

    const result = {
      success: rejectedRefs.length === 0,
      remote,
      branch: options.branch || 'HEAD',
      upstreamSet: options.setUpstream || false,
      pushedRefs,
      rejectedRefs,
    };

    return result;
  } catch (error) {
    throw mapGitError(error, 'push');
  }
}
