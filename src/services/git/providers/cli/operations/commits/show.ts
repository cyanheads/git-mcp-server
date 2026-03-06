/**
 * @fileoverview CLI provider git show operation
 * @module services/git/providers/cli/operations/commits/show
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitShowOptions,
  GitShowResult,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git show to display commit details.
 *
 * @param options - Show options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Show result
 */
export async function executeShow(
  options: GitShowOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitShowResult> {
  try {
    const args: string[] = [];

    if (options.stat) {
      args.push('--stat');
    }

    if (options.format === 'raw') {
      args.push('--format=raw');
    }

    // If filePath is specified, use commit:path syntax to show a specific file
    if (options.filePath) {
      args.push(`${options.object}:${options.filePath}`);
    } else {
      args.push(options.object);
    }

    // Determine object type reliably via cat-file
    const typeCmd = buildGitCommand({
      command: 'cat-file',
      args: ['-t', options.object],
    });
    const typeResult = await execGit(
      typeCmd,
      context.workingDirectory,
      context.requestContext,
    );
    const detectedType = typeResult.stdout.trim();
    const objectType = (['commit', 'tree', 'blob', 'tag'] as const).includes(
      detectedType as 'commit' | 'tree' | 'blob' | 'tag',
    )
      ? (detectedType as 'commit' | 'tree' | 'blob' | 'tag')
      : 'commit';

    const cmd = buildGitCommand({ command: 'show', args });
    const result = await execGit(
      cmd,
      context.workingDirectory,
      context.requestContext,
    );

    const showResult = {
      object: options.object,
      type: objectType,
      content: result.stdout,
      metadata: {},
    };

    return showResult;
  } catch (error) {
    throw mapGitError(error, 'show');
  }
}
