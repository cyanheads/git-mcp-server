/**
 * @fileoverview Git CLI output parsing utilities
 * @module services/git/providers/cli/utils/output-parser
 */

import type { GitBranchInfo, GitStatusResult } from '../../../types.js';

/** Delimiter for fields within a single record in porcelain formats. */
export const GIT_FIELD_DELIMITER = '\x1F';

/** Delimiter for records in porcelain formats. */
export const GIT_RECORD_DELIMITER = '\x1E';

/**
 * Parse git porcelain output into structured data.
 *
 * @param output - Raw git output
 * @param delimiter - Field delimiter (default: GIT_FIELD_DELIMITER)
 * @param recordDelimiter - Record delimiter (default: GIT_RECORD_DELIMITER)
 * @returns Array of parsed records
 */
export function parsePorcelainOutput(
  output: string,
  delimiter = GIT_FIELD_DELIMITER,
  recordDelimiter = GIT_RECORD_DELIMITER,
): string[][] {
  const records: string[][] = [];
  const lines = output.split(recordDelimiter).filter((r) => r.trim());

  for (const line of lines) {
    const fields = line.trim().split(delimiter);
    if (fields.length > 0) {
      records.push(fields);
    }
  }

  return records;
}

/**
 * Parse git status porcelain v2 output.
 *
 * @param output - Git status --porcelain=v2 -b output
 * @returns Parsed status information
 */
export function parseGitStatus(output: string): GitStatusResult {
  const lines = output.split('\n').filter(Boolean);
  const result: GitStatusResult = {
    currentBranch: null,
    stagedChanges: {},
    unstagedChanges: {},
    untrackedFiles: [],
    conflictedFiles: [],
    isClean: true,
  };

  for (const line of lines) {
    if (line.startsWith('#')) {
      // Header line, e.g., '# branch.head main'
      const parts = line.split(' ');
      if (parts[1] === 'branch.head' && parts[2]) {
        result.currentBranch = parts[2] === '(detached)' ? null : parts[2];
      }
      continue;
    }

    result.isClean = false;
    const parts = line.split(' ');
    const statusType = parts[0];

    if (statusType === '1') {
      // Normal entry: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      const xy = parts[1];
      const path = parts.slice(8).join(' ').trim();
      const stagedStatus = xy?.[0];
      const unstagedStatus = xy?.[1];

      if (stagedStatus && stagedStatus !== '.') {
        if (!result.stagedChanges) result.stagedChanges = {};
        if (stagedStatus === 'A')
          (result.stagedChanges.added ??= []).push(path);
        if (stagedStatus === 'M')
          (result.stagedChanges.modified ??= []).push(path);
        if (stagedStatus === 'D')
          (result.stagedChanges.deleted ??= []).push(path);
        if (stagedStatus === 'R')
          (result.stagedChanges.renamed ??= []).push(path);
        if (stagedStatus === 'C')
          (result.stagedChanges.copied ??= []).push(path);
      }
      if (unstagedStatus && unstagedStatus !== '.') {
        if (!result.unstagedChanges) result.unstagedChanges = {};
        if (unstagedStatus === 'M')
          (result.unstagedChanges.modified ??= []).push(path);
        if (unstagedStatus === 'D')
          (result.unstagedChanges.deleted ??= []).push(path);
      }
    } else if (statusType === '2') {
      // Renamed or copied entry: 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\t<origPath>
      const xy = parts[1];
      const stagedStatus = xy?.[0];
      const unstagedStatus = xy?.[1];
      const tabIdx = line.indexOf('\t');
      const pathSection = tabIdx !== -1 ? line.substring(tabIdx + 1) : '';
      const [newPath, oldPath] = pathSection.split('\t');
      const formatted = `${oldPath} -> ${newPath}`;

      if (stagedStatus && stagedStatus !== '.') {
        if (stagedStatus === 'R') {
          if (!result.stagedChanges.renamed) result.stagedChanges.renamed = [];
          result.stagedChanges.renamed.push(formatted);
        } else if (stagedStatus === 'C') {
          if (!result.stagedChanges.copied) result.stagedChanges.copied = [];
          result.stagedChanges.copied.push(formatted);
        }
      }
      if (unstagedStatus && unstagedStatus !== '.') {
        if (unstagedStatus === 'R' || unstagedStatus === 'M') {
          if (!result.unstagedChanges.modified)
            result.unstagedChanges.modified = [];
          result.unstagedChanges.modified.push(newPath || '');
        } else if (unstagedStatus === 'D') {
          if (!result.unstagedChanges.deleted)
            result.unstagedChanges.deleted = [];
          result.unstagedChanges.deleted.push(newPath || '');
        }
      }
    } else if (statusType === 'u') {
      // Unmerged (conflicted): u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      // Path is at index 10; spaces in path are preserved by joining the remainder.
      const path = parts.slice(10).join(' ').trim();
      result.conflictedFiles.push(path);
    } else if (statusType === '?') {
      // Untracked
      const path = line.substring(2);
      result.untrackedFiles.push(path);
    }
  }

  // Final check for cleanliness
  if (result.isClean && lines.length > 0) {
    // isClean might be false due to headers, but if no files are listed, it's clean
    const hasChanges =
      Object.values(result.stagedChanges).some(
        (arr) => arr && arr.length > 0,
      ) ||
      Object.values(result.unstagedChanges).some(
        (arr) => arr && arr.length > 0,
      ) ||
      result.untrackedFiles.length > 0 ||
      result.conflictedFiles.length > 0;
    result.isClean = !hasChanges;
  }

  return result;
}

/**
 * Parse git log output.
 *
 * @param output - Git log output with custom format
 * @returns Array of commit data
 */
export function parseGitLog(output: string): Array<Record<string, string>> {
  const commits: Array<Record<string, string>> = [];

  const records = output.split(GIT_RECORD_DELIMITER).filter((r) => r.trim());

  for (const record of records) {
    const fields = record.trim().split(GIT_FIELD_DELIMITER);

    // Default format: %H%x1F%an%x1F%ae%x1F%ad%x1F%s%x1E
    // (hash, author name, author email, date, subject)
    if (fields.length >= 5) {
      commits.push({
        hash: fields[0] || '',
        authorName: fields[1] || '',
        authorEmail: fields[2] || '',
        date: fields[3] || '',
        subject: fields[4] || '',
      });
    }
  }

  return commits;
}

/**
 * Parse git diff --stat output.
 *
 * @param output - Git diff --stat output
 * @returns Parsed diff statistics
 */
export function parseGitDiffStat(output: string): {
  files: Array<{ path: string; additions: number; deletions: number }>;
  totalAdditions: number;
  totalDeletions: number;
} {
  const lines = output.split('\n');
  const files: Array<{ path: string; additions: number; deletions: number }> =
    [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const line of lines) {
    // Match pattern: " path/to/file | 10 +++++-----"
    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([\+\-]*)/);
    if (match) {
      const path = match[1]!.trim();
      const symbols = match[3] || '';

      const additions = (symbols.match(/\+/g) || []).length;
      const deletions = (symbols.match(/-/g) || []).length;

      files.push({ path, additions, deletions });
      totalAdditions += additions;
      totalDeletions += deletions;
    }

    // Match summary line: " 3 files changed, 25 insertions(+), 10 deletions(-)"
    // Git omits the insertions or deletions term when the count is zero,
    // so match each independently to avoid falling back to symbol counting.
    if (line.match(/\d+ files? changed/)) {
      const insertionMatch = line.match(/(\d+) insertion[s]?\(\+\)/);
      const deletionMatch = line.match(/(\d+) deletion[s]?\(-\)/);
      if (insertionMatch || deletionMatch) {
        totalAdditions = insertionMatch
          ? parseInt(insertionMatch[1] ?? '0', 10)
          : 0;
        totalDeletions = deletionMatch
          ? parseInt(deletionMatch[1] ?? '0', 10)
          : 0;
      }
    }
  }

  return { files, totalAdditions, totalDeletions };
}

/**
 * Parse git branch output.
 *
 * @param output - Git branch output
 * @returns Array of branch information
 */
export function parseGitBranch(output: string): Array<{
  name: string;
  current: boolean;
  upstream?: string;
}> {
  const branches: Array<{
    name: string;
    current: boolean;
    upstream?: string;
  }> = [];
  const lines = output.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    const current = line.startsWith('*');
    const branchLine = line.substring(2).trim(); // Skip '* ' or '  '

    // Parse upstream tracking info if present
    const upstreamMatch = branchLine.match(/^(.+?)\s+->\s+(.+)$/);
    if (upstreamMatch) {
      branches.push({
        name: upstreamMatch[1]!.trim(),
        current,
        upstream: upstreamMatch[2]!.trim(),
      });
    } else {
      branches.push({
        name: branchLine,
        current,
      });
    }
  }

  return branches;
}

/**
 * Parse git remote output.
 *
 * @param output - Git remote -v output
 * @returns Array of remote information
 */
export function parseGitRemote(output: string): Array<{
  name: string;
  url: string;
  type: 'fetch' | 'push';
}> {
  const remotes: Array<{ name: string; url: string; type: 'fetch' | 'push' }> =
    [];
  const lines = output.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    // Format: "origin  https://github.com/user/repo.git (fetch)"
    const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)/);
    if (match) {
      remotes.push({
        name: match[1]!,
        url: match[2]!,
        type: match[3] as 'fetch' | 'push',
      });
    }
  }

  return remotes;
}

/**
 * Parse git tag output.
 *
 * @param output - Git tag -l output
 * @returns Array of tag names
 */
export function parseGitTag(output: string): string[] {
  return output.split('\n').filter((t) => t.trim());
}

/**
 * Parse the structured output of `git for-each-ref` to get detailed branch info.
 *
 * This parser is more robust than parsing `git branch -v` because it uses
 * machine-readable output format that won't break with git version changes.
 *
 * Expected format from git for-each-ref with custom delimiter:
 * refname<delim>objectname<delim>upstream:short<delim>upstream:track<delim>HEAD
 *
 * @param output - The raw stdout from the git for-each-ref command
 * @returns An array of branch information objects
 *
 * @example
 * ```typescript
 * // Command: git for-each-ref --format='%(refname)\x1F%(objectname)...' refs/heads
 * const branches = parseBranchRef(output);
 * console.log(branches[0].name); // 'main'
 * console.log(branches[0].ahead); // 2
 * ```
 */
export function parseBranchRef(output: string): GitBranchInfo[] {
  const branches: GitBranchInfo[] = [];
  const lines = output.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    const [refname, commitHash, upstream, trackInfo, head] =
      line.split(GIT_FIELD_DELIMITER);

    if (!refname) continue;

    // refname is like 'refs/heads/main' or 'refs/remotes/origin/main'
    const isRemote = refname.startsWith('refs/remotes/');
    const name = refname.replace(
      isRemote ? 'refs/remotes/' : 'refs/heads/',
      '',
    );

    // Parse tracking info like "ahead 2, behind 1" or "ahead 2" or "behind 1"
    let ahead = 0;
    let behind = 0;

    if (trackInfo) {
      const aheadMatch = trackInfo.match(/ahead (\d+)/);
      const behindMatch = trackInfo.match(/behind (\d+)/);
      ahead = aheadMatch ? parseInt(aheadMatch[1]!, 10) : 0;
      behind = behindMatch ? parseInt(behindMatch[1]!, 10) : 0;
    }

    const branchInfo: GitBranchInfo = {
      name,
      commitHash: commitHash || '',
      current: head === '*',
      ahead,
      behind,
    };

    // Only add upstream if it exists
    if (upstream) {
      branchInfo.upstream = upstream;
    }

    branches.push(branchInfo);
  }

  return branches;
}

/**
 * Parse the output of `git branch -v --no-abbrev`.
 *
 * @deprecated Use parseBranchRef() instead for more robust parsing
 * @param output - The raw stdout from the git command.
 * @returns An array of branch information objects.
 */
export function parseGitBranchList(output: string): GitBranchInfo[] {
  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const current = line.startsWith('*');
      const trimmed = line.substring(2).trim(); // Skip '* ' or '  '
      const parts = trimmed.split(/\s+/);

      const name = parts[0] || '';
      const commitHash = parts[1] || '';

      const trackingMatch = trimmed.match(/\[(.+?)\]/);
      const upstream = trackingMatch?.[1];

      const branch: GitBranchInfo = {
        name,
        current,
        commitHash,
      };

      if (upstream) {
        // Example upstream: 'origin/main: ahead 1'
        const [remoteBranch, ...status] = upstream.split(':');
        if (remoteBranch) {
          branch.upstream = remoteBranch;
        }
        if (status.length > 0) {
          const statusText = status.join(':');
          const aheadMatch = statusText.match(/ahead (\d+)/);
          const behindMatch = statusText.match(/behind (\d+)/);
          branch.ahead = aheadMatch?.[1] ? parseInt(aheadMatch[1], 10) : 0;
          branch.behind = behindMatch?.[1] ? parseInt(behindMatch[1], 10) : 0;
        }
      }
      return branch;
    });
}
