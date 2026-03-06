/**
 * @fileoverview CLI provider git stash operation
 * @module services/git/providers/cli/operations/stash/stash
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitStashOptions,
  GitStashResult,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git stash operations.
 *
 * @param options - Stash options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Stash result
 */
export async function executeStash(
  options: GitStashOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitStashResult> {
  try {
    const args: string[] = [options.mode];

    switch (options.mode) {
      case 'list': {
        // Use custom format to include unix timestamp
        args.push('--format=%gd\t%ct\t%gs');
        const cmd = buildGitCommand({ command: 'stash', args });
        const result = await execGit(
          cmd,
          context.workingDirectory,
          context.requestContext,
        );

        // Parse stash list output (format: refname\ttimestamp\tsubject)
        const stashes = result.stdout
          .split('\n')
          .filter((line) => line.trim())
          .map((line, index) => {
            // Format: 0\t1709747200\tWIP on branch: message
            const parts = line.split('\t');
            const [refPart, tsPart, ...subjectParts] = parts;
            if (refPart && tsPart && subjectParts.length > 0) {
              const stashIndex = parseInt(refPart, 10);
              const timestamp = parseInt(tsPart, 10);
              const subject = subjectParts.join('\t');
              // Extract branch from "WIP on <branch>:" or "On <branch>:"
              const branchMatch = subject.match(
                /^(?:WIP on|On)\s+([^:]+):\s+(.*)$/,
              );
              return {
                ref: `stash@{${stashIndex}}`,
                index: stashIndex,
                branch: branchMatch?.[1] ?? '',
                description: branchMatch?.[2] ?? subject,
                timestamp,
              };
            }
            return {
              ref: `stash@{${index}}`,
              index,
              branch: '',
              description: line,
              timestamp: 0,
            };
          });

        const listResult = {
          mode: 'list' as const,
          stashes,
        };

        return listResult;
      }

      case 'push': {
        if (options.message) {
          args.push('-m', options.message);
        }

        if (options.includeUntracked) {
          args.push('--include-untracked');
        }

        if (options.keepIndex) {
          args.push('--keep-index');
        }

        const cmd = buildGitCommand({ command: 'stash', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const pushResult = {
          mode: 'push' as const,
          created: 'stash@{0}',
        };

        return pushResult;
      }

      case 'pop':
      case 'apply': {
        if (options.stashRef) {
          args.push(options.stashRef);
        }

        const cmd = buildGitCommand({ command: 'stash', args });
        const result = await execGit(
          cmd,
          context.workingDirectory,
          context.requestContext,
        );

        const hasConflicts =
          result.stdout.includes('CONFLICT') ||
          result.stderr.includes('CONFLICT');

        const applyResult = {
          mode: options.mode,
          applied: options.stashRef || 'stash@{0}',
          conflicts: hasConflicts,
        };

        return applyResult;
      }

      case 'drop': {
        if (!options.stashRef) {
          throw new Error('Stash reference is required for drop operation');
        }

        args.push(options.stashRef);

        const cmd = buildGitCommand({ command: 'stash', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const dropResult = {
          mode: 'drop' as const,
          dropped: options.stashRef,
        };

        return dropResult;
      }

      case 'clear': {
        const cmd = buildGitCommand({ command: 'stash', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const clearResult = {
          mode: 'clear' as const,
        };

        return clearResult;
      }

      default:
        throw new Error('Unknown stash operation mode');
    }
  } catch (error) {
    throw mapGitError(error, 'stash');
  }
}
