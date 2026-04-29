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

const NUL = '\x00';
const COMMIT_META_FORMAT = [
  '%H',
  '%h',
  '%an',
  '%ae',
  '%aI',
  '%cn',
  '%ce',
  '%cI',
  '%P',
  '%s',
  '%b',
].join(NUL);

interface CommitMetadata {
  hash: string;
  shortHash: string;
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
  parents: string[];
  subject: string;
  body: string;
}

function parseCommitMetadata(stdout: string): CommitMetadata | null {
  const fields = stdout.split(NUL);
  if (fields.length < 11) return null;
  const [
    hash,
    shortHash,
    authorName,
    authorEmail,
    authorDate,
    committerName,
    committerEmail,
    committerDate,
    parents,
    subject,
    body,
  ] = fields as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    hash,
    shortHash,
    author: { name: authorName, email: authorEmail, date: authorDate },
    committer: {
      name: committerName,
      email: committerEmail,
      date: committerDate,
    },
    parents: parents.trim().split(' ').filter(Boolean),
    subject,
    body: body.replace(/\n+$/, ''),
  };
}

/**
 * Execute git show to display object details.
 *
 * Issues `cat-file -t`, `show`, and (for commits) `log -1 --format` in parallel.
 * The metadata fetch is best-effort: if it fails, metadata stays empty rather
 * than failing the whole operation.
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

    if (options.filePath) {
      args.push(`${options.object}:${options.filePath}`);
    } else {
      args.push(options.object);
    }

    const typeCmd = buildGitCommand({
      command: 'cat-file',
      args: ['-t', options.object],
    });
    const cmd = buildGitCommand({ command: 'show', args });
    const metaCmd = buildGitCommand({
      command: 'log',
      args: ['-1', `--format=${COMMIT_META_FORMAT}`, options.object],
    });

    const [typeSettled, contentSettled, metaSettled] = await Promise.allSettled(
      [
        execGit(typeCmd, context.workingDirectory, context.requestContext),
        execGit(cmd, context.workingDirectory, context.requestContext),
        execGit(metaCmd, context.workingDirectory, context.requestContext),
      ],
    );

    if (typeSettled.status === 'rejected') throw typeSettled.reason;
    if (contentSettled.status === 'rejected') throw contentSettled.reason;

    const detectedType = typeSettled.value.stdout.trim();
    const objectType = (['commit', 'tree', 'blob', 'tag'] as const).includes(
      detectedType as 'commit' | 'tree' | 'blob' | 'tag',
    )
      ? (detectedType as 'commit' | 'tree' | 'blob' | 'tag')
      : 'commit';

    let metadata: Record<string, unknown> = {};
    if (
      objectType === 'commit' &&
      metaSettled.status === 'fulfilled' &&
      metaSettled.value?.stdout
    ) {
      const parsed = parseCommitMetadata(metaSettled.value.stdout);
      if (parsed) metadata = parsed as unknown as Record<string, unknown>;
    }

    return {
      object: options.object,
      type: objectType,
      content: contentSettled.value.stdout,
      metadata,
    };
  } catch (error) {
    throw mapGitError(error, 'show');
  }
}
