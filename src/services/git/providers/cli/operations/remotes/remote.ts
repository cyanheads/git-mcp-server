/**
 * @fileoverview CLI provider git remote operation
 * @module services/git/providers/cli/operations/remotes/remote
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitRemoteOptions,
  GitRemoteResult,
} from '../../../../types.js';
import {
  buildGitCommand,
  mapGitError,
  parseGitRemote,
} from '../../utils/index.js';

/**
 * Execute git remote operations.
 */
export async function executeRemote(
  options: GitRemoteOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitRemoteResult> {
  try {
    const args: string[] = [];

    switch (options.mode) {
      case 'list': {
        args.push('-v');

        const cmd = buildGitCommand({ command: 'remote', args });
        const result = await execGit(
          cmd,
          context.workingDirectory,
          context.requestContext,
        );

        const parsedRemotes = parseGitRemote(result.stdout);

        // Group by remote name to combine fetch/push URLs
        const remoteMap = new Map<
          string,
          { fetchUrl?: string; pushUrl?: string }
        >();

        for (const remote of parsedRemotes) {
          const existing = remoteMap.get(remote.name) || {};
          if (remote.type === 'fetch') {
            existing.fetchUrl = remote.url;
          } else {
            existing.pushUrl = remote.url;
          }
          remoteMap.set(remote.name, existing);
        }

        const remotes = Array.from(remoteMap.entries()).map(([name, urls]) => ({
          name,
          fetchUrl: urls.fetchUrl || '',
          pushUrl: urls.pushUrl || urls.fetchUrl || '',
        }));

        const listResult = {
          mode: 'list' as const,
          remotes,
        };

        return listResult;
      }

      case 'add': {
        if (!options.name || !options.url) {
          throw new Error('Remote name and URL are required for add operation');
        }

        args.push('add', options.name, options.url);

        const cmd = buildGitCommand({ command: 'remote', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const addResult = {
          mode: 'add' as const,
          added: { name: options.name, url: options.url },
        };

        return addResult;
      }

      case 'remove': {
        if (!options.name) {
          throw new Error('Remote name is required for remove operation');
        }

        args.push('remove', options.name);

        const cmd = buildGitCommand({ command: 'remote', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const removeResult = {
          mode: 'remove' as const,
          removed: options.name,
        };

        return removeResult;
      }

      case 'rename': {
        if (!options.name || !options.newName) {
          throw new Error(
            'Remote name and new name are required for rename operation',
          );
        }

        args.push('rename', options.name, options.newName);

        const cmd = buildGitCommand({ command: 'remote', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const renameResult = {
          mode: 'rename' as const,
          renamed: { from: options.name, to: options.newName },
        };

        return renameResult;
      }

      case 'get-url': {
        if (!options.name) {
          throw new Error('Remote name is required for get-url operation');
        }

        args.push('get-url', options.name);

        if (options.push) {
          args.push('--push');
        }

        const cmd = buildGitCommand({ command: 'remote', args });
        const result = await execGit(
          cmd,
          context.workingDirectory,
          context.requestContext,
        );

        const getUrlResult = {
          mode: 'get-url' as const,
          url: result.stdout.trim(),
        };

        return getUrlResult;
      }

      case 'set-url': {
        if (!options.name || !options.url) {
          throw new Error(
            'Remote name and URL are required for set-url operation',
          );
        }

        args.push('set-url', options.name, options.url);

        if (options.push) {
          args.push('--push');
        }

        const cmd = buildGitCommand({ command: 'remote', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const setUrlResult = {
          mode: 'set-url' as const,
        };

        return setUrlResult;
      }

      default:
        throw new Error('Unknown remote operation mode');
    }
  } catch (error) {
    throw mapGitError(error, 'remote');
  }
}
