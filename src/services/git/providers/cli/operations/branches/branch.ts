/**
 * @fileoverview Git branch operations
 * @module services/git/providers/cli/operations/branches/branch
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitBranchOptions,
  GitBranchResult,
  GitOperationContext,
} from '../../../../types.js';
import {
  buildGitCommand,
  GIT_FIELD_DELIMITER,
  mapGitError,
  parseBranchRef,
} from '../../utils/index.js';

/**
 * Execute git branch operations.
 */
export async function executeBranch(
  options: GitBranchOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitBranchResult> {
  try {
    const args: string[] = [];

    switch (options.mode) {
      case 'show-current': {
        // One cheap call — avoids scanning refs/heads just to find the current branch.
        const cmd = buildGitCommand({
          command: 'symbolic-ref',
          args: ['--quiet', '--short', 'HEAD'],
        });
        try {
          const res = await execGit(
            cmd,
            context.workingDirectory,
            context.requestContext,
          );
          return {
            mode: 'show-current' as const,
            current: res.stdout.trim() || null,
          };
        } catch {
          // Exit code 1 with --quiet means detached HEAD; treat as null.
          return { mode: 'show-current' as const, current: null };
        }
      }

      case 'list': {
        // Build a custom format for git for-each-ref using field delimiters
        // This provides structured, machine-readable output that's more stable
        // than parsing the human-readable output of `git branch -v`
        const format = [
          '%(refname)', // Full ref name (e.g., refs/heads/main)
          '%(objectname)', // Commit hash
          '%(upstream:short)', // Upstream branch name (e.g., origin/main)
          '%(upstream:track)', // Tracking info (e.g., "ahead 1, behind 2")
          '%(HEAD)', // '*' for current branch
        ].join(GIT_FIELD_DELIMITER);

        // Choose the ref prefix based on whether we want remote, local, or all branches
        const refPrefixes: string[] = options.all
          ? ['refs/heads', 'refs/remotes']
          : [options.remote ? 'refs/remotes' : 'refs/heads'];

        args.push(`--format=${format}`, ...refPrefixes);

        // Add merge filtering if specified (skip when explicitly false)
        if (options.merged !== undefined && options.merged !== false) {
          const mergedRef =
            typeof options.merged === 'string' ? options.merged : 'HEAD';
          args.push(`--merged=${mergedRef}`);
        }
        if (options.noMerged !== undefined && options.noMerged !== false) {
          const noMergedRef =
            typeof options.noMerged === 'string' ? options.noMerged : 'HEAD';
          args.push(`--no-merged=${noMergedRef}`);
        }

        if (typeof options.limit === 'number' && options.limit > 0) {
          args.push(`--count=${options.limit}`);
        }

        const cmd = buildGitCommand({ command: 'for-each-ref', args });
        const result = await execGit(
          cmd,
          context.workingDirectory,
          context.requestContext,
        );

        const branches = parseBranchRef(result.stdout);

        return {
          mode: 'list' as const,
          branches,
        };
      }

      case 'create': {
        if (!options.branchName) {
          throw new Error('Branch name is required for create operation');
        }

        args.push(options.branchName);

        if (options.startPoint) {
          args.push(options.startPoint);
        }

        if (options.force) {
          args.push('--force');
        }

        const cmd = buildGitCommand({ command: 'branch', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        return {
          mode: 'create' as const,
          created: options.branchName,
        };
      }

      case 'delete': {
        if (!options.branchName) {
          throw new Error('Branch name is required for delete operation');
        }

        args.push(options.force ? '-D' : '-d', options.branchName);

        const cmd = buildGitCommand({ command: 'branch', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        return {
          mode: 'delete' as const,
          deleted: options.branchName,
        };
      }

      case 'rename': {
        if (!options.branchName || !options.newBranchName) {
          throw new Error(
            'Both branch names are required for rename operation',
          );
        }

        args.push('-m', options.branchName, options.newBranchName);

        if (options.force) {
          args.push('--force');
        }

        const cmd = buildGitCommand({ command: 'branch', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        return {
          mode: 'rename' as const,
          renamed: {
            from: options.branchName,
            to: options.newBranchName,
          },
        };
      }

      default:
        throw new Error('Unknown branch operation mode');
    }
  } catch (error) {
    throw mapGitError(error, 'branch');
  }
}
