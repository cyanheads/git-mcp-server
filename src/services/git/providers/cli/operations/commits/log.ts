/**
 * @fileoverview CLI provider git log operation
 * @module services/git/providers/cli/operations/commits/log
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitLogOptions,
  GitLogResult,
  GitOperationContext,
} from '../../../../types.js';
import {
  buildGitCommand,
  GIT_FIELD_DELIMITER,
  mapGitError,
} from '../../utils/index.js';

// Unique markers for parsing log output with stat/patch
const COMMIT_START_MARKER = '<<<COMMIT_START>>>';
const COMMIT_END_MARKER = '<<<COMMIT_END>>>';

/**
 * Execute git log to view commit history.
 *
 * @param options - Log options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Log result
 */
export async function executeLog(
  options: GitLogOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitLogResult> {
  try {
    // Format with start/end markers for robust parsing when stat/patch is included
    // Format: START hash|shortHash|author|email|timestamp|subject|body|parents END
    const formatStr = `${COMMIT_START_MARKER}%H${GIT_FIELD_DELIMITER}%h${GIT_FIELD_DELIMITER}%an${GIT_FIELD_DELIMITER}%ae${GIT_FIELD_DELIMITER}%at${GIT_FIELD_DELIMITER}%s${GIT_FIELD_DELIMITER}%b${GIT_FIELD_DELIMITER}%P${COMMIT_END_MARKER}`;

    const args = [`--format=${formatStr}`];

    if (options.maxCount) {
      args.push(`-n${options.maxCount}`);
    }

    if (options.skip) {
      args.push(`--skip=${options.skip}`);
    }

    if (options.since) {
      args.push(`--since=${options.since}`);
    }

    if (options.until) {
      args.push(`--until=${options.until}`);
    }

    if (options.author) {
      args.push(`--author=${options.author}`);
    }

    if (options.grep) {
      args.push(`--grep=${options.grep}`);
    }

    // Add stat flag if requested
    if (options.stat) {
      args.push('--stat');
    }

    // Add patch flag if requested
    if (options.patch) {
      args.push('-p');
    }

    // Add branch argument if specified (must come before -- separator)
    if (options.branch) {
      args.push(options.branch);
    }

    // Add file path filter if specified (must come after -- separator)
    if (options.path) {
      args.push('--', options.path);
    }

    const cmd = buildGitCommand({ command: 'log', args });
    const gitOutput = await execGit(
      cmd,
      context.workingDirectory,
      context.requestContext,
    );

    // Parse commits from output
    // With stat/patch, extra content appears AFTER the END marker but BEFORE the next START marker
    const commits: Array<{
      hash: string;
      shortHash: string;
      author: string;
      authorEmail: string;
      timestamp: number;
      subject: string;
      body?: string;
      parents: string[];
      refs?: string[];
      stat?: string;
      patch?: string;
    }> = [];

    // Split by START marker to get each commit section
    const sections = gitOutput.stdout
      .split(COMMIT_START_MARKER)
      .filter((s) => s.trim());

    for (const section of sections) {
      // Find the END marker - everything before it is the commit format, after is stat/patch
      const endIdx = section.indexOf(COMMIT_END_MARKER);
      if (endIdx === -1) continue;

      const formatPart = section.substring(0, endIdx);
      const extraPart = section
        .substring(endIdx + COMMIT_END_MARKER.length)
        .trim();

      const fields = formatPart.split(GIT_FIELD_DELIMITER);
      const commit: {
        hash: string;
        shortHash: string;
        author: string;
        authorEmail: string;
        timestamp: number;
        subject: string;
        body?: string;
        parents: string[];
        refs?: string[];
        stat?: string;
        patch?: string;
      } = {
        hash: fields[0] || '',
        shortHash: fields[1] || '',
        author: fields[2] || '',
        authorEmail: fields[3] || '',
        timestamp: parseInt(fields[4] || '0', 10),
        subject: fields[5] || '',
        parents: (fields[7] || '').split(' ').filter((p) => p),
      };

      if (fields[6]) {
        commit.body = fields[6];
      }

      // Add stat/patch content if present
      if (extraPart) {
        if (options.stat && options.patch) {
          // Both requested - stat comes first, then patch (separated by diff header)
          const diffStart = extraPart.indexOf('\ndiff --git');
          if (diffStart !== -1) {
            commit.stat = extraPart.substring(0, diffStart).trim();
            commit.patch = extraPart.substring(diffStart + 1).trim();
          } else {
            // No diff found, assume it's all stat
            commit.stat = extraPart;
          }
        } else if (options.patch) {
          commit.patch = extraPart;
        } else if (options.stat) {
          commit.stat = extraPart;
        }
      }

      commits.push(commit);
    }

    return {
      commits,
      totalCount: commits.length,
    };
  } catch (error) {
    throw mapGitError(error, 'log');
  }
}
