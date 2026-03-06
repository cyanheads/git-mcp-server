/**
 * @fileoverview CLI provider git worktree operation
 * @module services/git/providers/cli/operations/worktree/worktree
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitWorktreeOptions,
  GitWorktreeResult,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git worktree operations.
 *
 * @param options - Worktree options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Worktree result
 */
export async function executeWorktree(
  options: GitWorktreeOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitWorktreeResult> {
  try {
    const args: string[] = [options.mode];

    switch (options.mode) {
      case 'list': {
        args.push('--porcelain');

        const cmd = buildGitCommand({ command: 'worktree', args });
        const result = await execGit(
          cmd,
          context.workingDirectory,
          context.requestContext,
        );

        // Parse worktree list output (porcelain format)
        const worktrees: GitWorktreeResult['worktrees'] = [];
        const lines = result.stdout.split('\n');
        let current: Partial<NonNullable<GitWorktreeResult['worktrees']>[0]> =
          {};

        for (const line of lines) {
          if (line.startsWith('worktree ')) {
            if (current.path) {
              const worktree: NonNullable<GitWorktreeResult['worktrees']>[0] = {
                path: current.path,
                head: current.head || '',
                bare: current.bare || false,
                detached: current.detached || false,
                locked: current.locked || false,
                prunable: current.prunable || false,
              };
              if (current.branch) {
                worktree.branch = current.branch;
              }
              worktrees.push(worktree);
            }
            current = { path: line.substring(9) };
          } else if (line.startsWith('HEAD ')) {
            current.head = line.substring(5);
          } else if (line.startsWith('branch ')) {
            current.branch = line.substring(7);
            current.detached = false;
          } else if (line.startsWith('detached')) {
            current.detached = true;
          } else if (line.startsWith('bare')) {
            current.bare = true;
          } else if (line.startsWith('locked')) {
            current.locked = true;
          } else if (line.startsWith('prunable')) {
            current.prunable = true;
          }
        }

        // Add last worktree
        if (current.path) {
          const worktree: NonNullable<GitWorktreeResult['worktrees']>[0] = {
            path: current.path,
            head: current.head || '',
            bare: current.bare || false,
            detached: current.detached || false,
            locked: current.locked || false,
            prunable: current.prunable || false,
          };
          if (current.branch) {
            worktree.branch = current.branch;
          }
          worktrees.push(worktree);
        }

        const listResult = {
          mode: 'list' as const,
          worktrees,
        };

        return listResult;
      }

      case 'add': {
        if (!options.path) {
          throw new Error('Path is required for add operation');
        }

        // Flags must precede <path> [commitish]:
        //   git worktree add [-b <branch>] [--detach] [--force] <path> [commitish]
        if (options.branch) {
          args.push('-b', options.branch);
        }

        if (options.detach) {
          args.push('--detach');
        }

        if (options.force) {
          args.push('--force');
        }

        args.push(options.path);

        if (options.commitish) {
          args.push(options.commitish);
        }

        const cmd = buildGitCommand({ command: 'worktree', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const addResult = {
          mode: 'add' as const,
          added: options.path,
        };

        return addResult;
      }

      case 'remove': {
        if (!options.path) {
          throw new Error('Path is required for remove operation');
        }

        args.push(options.path);

        if (options.force) {
          args.push('--force');
        }

        const cmd = buildGitCommand({ command: 'worktree', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const removeResult = {
          mode: 'remove' as const,
          removed: options.path,
        };

        return removeResult;
      }

      case 'move': {
        if (!options.path || !options.newPath) {
          throw new Error('Path and new path are required for move operation');
        }

        args.push(options.path, options.newPath);

        const cmd = buildGitCommand({ command: 'worktree', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const moveResult = {
          mode: 'move' as const,
          moved: { from: options.path, to: options.newPath },
        };

        return moveResult;
      }

      case 'prune': {
        if (options.dryRun) {
          args.push('--dry-run');
        }

        if (options.verbose) {
          args.push('--verbose');
        }

        const cmd = buildGitCommand({ command: 'worktree', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const pruneResult = {
          mode: 'prune' as const,
          pruned: [],
        };

        return pruneResult;
      }

      default:
        throw new Error('Unknown worktree operation mode');
    }
  } catch (error) {
    throw mapGitError(error, 'worktree');
  }
}
