/**
 * @fileoverview CLI provider git reflog operation
 * @module services/git/providers/cli/operations/history/reflog
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitReflogOptions,
  GitReflogResult,
} from '../../../../types.js';
import {
  buildGitCommand,
  GIT_FIELD_DELIMITER,
  GIT_RECORD_DELIMITER,
  mapGitError,
  parsePorcelainOutput,
} from '../../utils/index.js';

/**
 * Execute git reflog to view reference logs.
 *
 * @param options - Reflog options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Reflog result
 */
export async function executeReflog(
  options: GitReflogOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitReflogResult> {
  try {
    const ref = options.ref || 'HEAD';
    const args = [
      `--format=%H${GIT_FIELD_DELIMITER}%gd${GIT_FIELD_DELIMITER}%gs${GIT_FIELD_DELIMITER}%ct${GIT_RECORD_DELIMITER}`,
    ];

    if (options.maxCount) {
      args.push(`-n${options.maxCount}`);
    }

    args.push(ref);

    const cmd = buildGitCommand({ command: 'reflog', args });
    const gitOutput = await execGit(
      cmd,
      context.workingDirectory,
      context.requestContext,
    );

    // Parse reflog output
    const entries: GitReflogResult['entries'] = [];
    const records = parsePorcelainOutput(gitOutput.stdout);

    for (const fields of records) {
      if (fields.length >= 4) {
        const hash = fields[0];
        const refName = fields[1];
        const message = fields[2];
        const timestampStr = fields[3];

        if (!hash || !refName || !message || !timestampStr) {
          continue;
        }

        // Parse action verb from the %gs subject (e.g., "commit: fix bug" → "commit",
        // "checkout: moving from main to feature" → "checkout")
        const colonIndex = message.indexOf(':');
        const action = colonIndex !== -1 ? message.substring(0, colonIndex).trim() : message;

        entries.push({
          hash,
          refName,
          action,
          message,
          timestamp: parseInt(timestampStr, 10),
        });
      }
    }

    const result = {
      success: true,
      ref,
      entries,
      totalEntries: entries.length,
    };

    return result;
  } catch (error) {
    throw mapGitError(error, 'reflog');
  }
}
