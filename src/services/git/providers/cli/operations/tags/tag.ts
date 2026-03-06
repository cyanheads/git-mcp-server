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
  GIT_FIELD_DELIMITER,
  mapGitError,
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
        // Use for-each-ref to get tag names with their dereferenced commit hashes
        const format = [
          '%(refname:short)', // Tag name
          '%(if)%(*objectname:short)%(then)%(*objectname:short)%(else)%(objectname:short)%(end)', // Dereferenced commit hash (resolves annotated tags to their target)
          '%(if)%(contents:subject)%(then)%(contents:subject)%(end)', // Tag message subject (annotated tags only)
          '%(if)%(taggername)%(then)%(taggername) <%(taggeremail)>%(end)', // Tagger (annotated tags only)
          '%(if)%(creatordate:unix)%(then)%(creatordate:unix)%(end)', // Timestamp
        ].join(GIT_FIELD_DELIMITER);

        const refCmd = buildGitCommand({
          command: 'for-each-ref',
          args: [`--format=${format}`, '--sort=-creatordate', 'refs/tags'],
        });
        const result = await execGit(
          refCmd,
          context.workingDirectory,
          context.requestContext,
        );

        const tags: Array<{
          name: string;
          commit: string;
          message?: string;
          tagger?: string;
          timestamp?: number;
        }> = [];

        for (const line of result.stdout.split('\n').filter((l) => l.trim())) {
          const [name, commit, message, tagger, timestamp] =
            line.split(GIT_FIELD_DELIMITER);
          if (!name) continue;

          const tag: (typeof tags)[number] = {
            name,
            commit: commit || '',
          };
          if (message) tag.message = message;
          if (tagger) tag.tagger = tagger;
          if (timestamp) tag.timestamp = parseInt(timestamp, 10);

          tags.push(tag);
        }

        return { mode: 'list' as const, tags };
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
          } else if (options.message) {
            createArgs.push('-a', '-m', options.message);
          } else if (options.annotated) {
            // Annotated without message — git would open an editor,
            // which doesn't work in MCP context. Use tag name as default message.
            createArgs.push('-a', '-m', `Tag ${options.tagName}`);
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
