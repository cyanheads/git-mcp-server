/**
 * @fileoverview CLI provider git tag operation
 * @module services/git/providers/cli/operations/tags/tag
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitTagOptions,
  GitTagResult,
} from '../../../../types.js';
import {
  buildGitCommand,
  mapGitError,
  parseGitTag,
  shouldSignCommits,
} from '../../utils/index.js';

/**
 * Execute git tag operations.
 *
 * @param options - Tag options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Tag result
 */
export async function executeTag(
  options: GitTagOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitTagResult> {
  try {
    const args: string[] = [];

    switch (options.mode) {
      case 'list': {
        args.push('-l');

        const cmd = buildGitCommand({ command: 'tag', args });
        const result = await execGit(
          cmd,
          context.workingDirectory,
          context.requestContext,
        );

        const tagNames = parseGitTag(result.stdout);
        const tags = tagNames.map((name) => ({
          name,
          commit: '', // Would need separate call to get commit
        }));

        const listResult = {
          mode: 'list' as const,
          tags,
        };

        return listResult;
      }

      case 'create': {
        if (!options.tagName) {
          throw new Error('Tag name is required for create operation');
        }

        // Determine if we should sign the tag - use explicit option or fall back to config default
        const shouldSign = options.sign ?? shouldSignCommits();

        // Build args for create, factored out so we can retry unsigned on failure
        const buildCreateArgs = (sign: boolean): string[] => {
          const createArgs: string[] = [options.tagName!];

          if (sign) {
            const message = options.message || `Tag ${options.tagName}`;
            createArgs.push('-s', '-m', message);
          } else if (options.message && options.annotated) {
            createArgs.push('-a', '-m', options.message);
          }

          if (options.commit) {
            createArgs.push(options.commit);
          }

          if (options.force) {
            createArgs.push('--force');
          }

          return createArgs;
        };

        const createCmd = buildGitCommand({
          command: 'tag',
          args: buildCreateArgs(shouldSign),
        });

        try {
          await execGit(
            createCmd,
            context.workingDirectory,
            context.requestContext,
          );
        } catch (error) {
          if (shouldSign && options.forceUnsignedOnFailure) {
            const unsignedCmd = buildGitCommand({
              command: 'tag',
              args: buildCreateArgs(false),
            });
            await execGit(
              unsignedCmd,
              context.workingDirectory,
              context.requestContext,
            );
          } else {
            throw error;
          }
        }

        const createResult = {
          mode: 'create' as const,
          created: options.tagName,
        };

        return createResult;
      }

      case 'delete': {
        if (!options.tagName) {
          throw new Error('Tag name is required for delete operation');
        }

        args.push('-d', options.tagName);

        const cmd = buildGitCommand({ command: 'tag', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const deleteResult = {
          mode: 'delete' as const,
          deleted: options.tagName,
        };

        return deleteResult;
      }

      default:
        throw new Error('Unknown tag operation mode');
    }
  } catch (error) {
    throw mapGitError(error, 'tag');
  }
}
