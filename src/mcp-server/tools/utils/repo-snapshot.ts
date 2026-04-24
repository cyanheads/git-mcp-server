/**
 * @fileoverview Best-effort repository snapshot gatherer for tool responses.
 * Produces a consistent "orientation" payload (status, recent commits, recent
 * tags, optional remotes) that enrich-on-setup tools return alongside their
 * primary result. Failures degrade gracefully into actionable warnings rather
 * than bubbling up. Exports the Zod schemas so tool output schemas stay in
 * lockstep with the shape this helper produces.
 * @module mcp-server/tools/utils/repo-snapshot
 */
import { z } from 'zod';

import type { IGitProvider } from '@/services/git/core/IGitProvider.js';
import type { GitOperationContext } from '@/services/git/types.js';
import { logger, type RequestContext } from '@/utils/index.js';

/**
 * Current working tree state, inclusive of branch tracking info. Filenames are
 * returned in full so callers can plan commits and resolution without a second
 * round-trip for detail.
 */
export const RepoSnapshotStatusSchema = z.object({
  branch: z
    .string()
    .nullable()
    .describe('Current branch (null on detached HEAD).'),
  isClean: z.boolean().describe('True when the working tree has no changes.'),
  staged: z.array(z.string()).describe('Paths staged for the next commit.'),
  unstaged: z.array(z.string()).describe('Paths with unstaged modifications.'),
  untracked: z.array(z.string()).describe('Untracked paths.'),
  conflicts: z.array(z.string()).describe('Paths with merge conflicts.'),
  upstream: z
    .string()
    .optional()
    .describe('Upstream ref being tracked by the current branch.'),
  ahead: z
    .number()
    .int()
    .optional()
    .describe('Commits ahead of upstream (if tracking).'),
  behind: z
    .number()
    .int()
    .optional()
    .describe('Commits behind upstream (if tracking).'),
});

export const RepoSnapshotCommitSchema = z.object({
  hash: z.string().describe('Short commit hash.'),
  author: z.string().describe('Author name.'),
  date: z.string().describe('Author date (ISO 8601).'),
  subject: z.string().describe('First line of the commit message.'),
});

export const RepoSnapshotTagSchema = z.object({
  name: z.string().describe('Tag name.'),
  date: z
    .string()
    .optional()
    .describe(
      'Creator date (ISO 8601); absent for lightweight tags with no metadata.',
    ),
  tagger: z
    .string()
    .optional()
    .describe('Tagger identity (annotated tags only).'),
  annotationSubject: z
    .string()
    .optional()
    .describe('First line of the tag annotation (annotated tags only).'),
  annotationBody: z
    .string()
    .optional()
    .describe(
      'Remaining annotation body after the subject (annotated tags only).',
    ),
});

export const RepoSnapshotRemoteSchema = z.object({
  name: z.string().describe('Remote name.'),
  fetchUrl: z.string().describe('Fetch URL.'),
  pushUrl: z.string().describe('Push URL (may differ from fetch URL).'),
});

export type RepoSnapshotStatus = z.infer<typeof RepoSnapshotStatusSchema>;
export type RepoSnapshotCommit = z.infer<typeof RepoSnapshotCommitSchema>;
export type RepoSnapshotTag = z.infer<typeof RepoSnapshotTagSchema>;
export type RepoSnapshotRemote = z.infer<typeof RepoSnapshotRemoteSchema>;

export interface RepoSnapshot {
  status: RepoSnapshotStatus;
  recentCommits: RepoSnapshotCommit[];
  recentTags: RepoSnapshotTag[];
  remotes?: RepoSnapshotRemote[];
}

export interface GatherRepoSnapshotOptions {
  /** Number of recent commits to include. Defaults to 2. */
  commitLimit?: number;
  /** Number of recent tags to include. Defaults to 2. */
  tagLimit?: number;
  /** Include configured remotes. Set true for setup tools that care about pushability. */
  includeRemotes?: boolean;
}

export interface GatherRepoSnapshotResult {
  snapshot?: RepoSnapshot;
  warnings: string[];
}

interface GatherDependencies {
  provider: IGitProvider;
  appContext: RequestContext;
  workingDirectory: string;
}

const NOT_A_REPO_HINT =
  'Repository snapshot unavailable — the path may not be a git repository. Initialize it via git_init or point at an existing repo.';

function reasonMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  if (reason === null || reason === undefined) return 'unknown error';
  try {
    return JSON.stringify(reason);
  } catch {
    return 'unknown error';
  }
}

function isNotARepoError(reason: unknown): boolean {
  if (!reason) return false;
  return /not a git repository/i.test(reasonMessage(reason));
}

/**
 * `git log` errors with "does not have any commits yet" when the repo is freshly
 * initialized. That's the expected baseline after `git init`, not a failure —
 * suppress the warning and surface an empty `recentCommits` array.
 */
function isEmptyRepoError(reason: unknown): boolean {
  if (!reason) return false;
  return /does not have any commits yet/i.test(reasonMessage(reason));
}

function toIsoDate(unixSeconds: number | undefined): string | undefined {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) {
    return undefined;
  }
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Gather a best-effort repository snapshot in parallel. Individual operation
 * failures are surfaced as `warnings` entries; a path that isn't a git repo
 * collapses every failure into a single actionable hint and omits the snapshot.
 */
export async function gatherRepoSnapshot(
  deps: GatherDependencies,
  options: GatherRepoSnapshotOptions = {},
): Promise<GatherRepoSnapshotResult> {
  const { provider, appContext, workingDirectory } = deps;
  const commitLimit = options.commitLimit ?? 2;
  const tagLimit = options.tagLimit ?? 2;
  const tenantId = appContext.tenantId || 'default-tenant';

  const context: GitOperationContext = {
    workingDirectory,
    requestContext: appContext,
    tenantId,
  };

  const fetchStatus = provider.status({ includeUntracked: true }, context);
  const fetchLog = provider.log({ maxCount: commitLimit }, context);
  const fetchTags = provider.tag({ mode: 'list', limit: tagLimit }, context);
  const fetchRemotes = options.includeRemotes
    ? provider.remote({ mode: 'list' }, context)
    : Promise.resolve(undefined);

  const [statusRes, logRes, tagsRes, remotesRes] = await Promise.allSettled([
    fetchStatus,
    fetchLog,
    fetchTags,
    fetchRemotes,
  ]);

  const settled = [statusRes, logRes, tagsRes, remotesRes];
  const rejections = settled.filter(
    (s): s is PromiseRejectedResult => s.status === 'rejected',
  );

  if (
    rejections.length > 0 &&
    rejections.every((r) => isNotARepoError(r.reason))
  ) {
    logger.debug('Repository snapshot skipped: path is not a git repository', {
      ...appContext,
      workingDirectory,
    });
    return { warnings: [NOT_A_REPO_HINT] };
  }

  const warnings: string[] = [];

  const status: RepoSnapshotStatus =
    statusRes.status === 'fulfilled'
      ? {
          branch: statusRes.value.currentBranch,
          isClean: statusRes.value.isClean,
          staged: [
            ...(statusRes.value.stagedChanges.added ?? []),
            ...(statusRes.value.stagedChanges.modified ?? []),
            ...(statusRes.value.stagedChanges.deleted ?? []),
            ...(statusRes.value.stagedChanges.renamed ?? []),
            ...(statusRes.value.stagedChanges.copied ?? []),
          ],
          unstaged: [
            ...(statusRes.value.unstagedChanges.added ?? []),
            ...(statusRes.value.unstagedChanges.modified ?? []),
            ...(statusRes.value.unstagedChanges.deleted ?? []),
          ],
          untracked: statusRes.value.untrackedFiles,
          conflicts: statusRes.value.conflictedFiles,
          ...(statusRes.value.upstream
            ? { upstream: statusRes.value.upstream }
            : {}),
          ...(typeof statusRes.value.ahead === 'number'
            ? { ahead: statusRes.value.ahead }
            : {}),
          ...(typeof statusRes.value.behind === 'number'
            ? { behind: statusRes.value.behind }
            : {}),
        }
      : {
          branch: null,
          isClean: false,
          staged: [],
          unstaged: [],
          untracked: [],
          conflicts: [],
        };

  if (statusRes.status === 'rejected') {
    warnings.push(`status unavailable: ${reasonMessage(statusRes.reason)}`);
  }

  const recentCommits: RepoSnapshotCommit[] =
    logRes.status === 'fulfilled'
      ? logRes.value.commits.map((commit) => ({
          hash: commit.shortHash,
          author: commit.author ?? '',
          date:
            typeof commit.timestamp === 'number'
              ? new Date(commit.timestamp * 1000).toISOString()
              : '',
          subject: commit.subject,
        }))
      : [];

  if (logRes.status === 'rejected' && !isEmptyRepoError(logRes.reason)) {
    warnings.push(
      `recent commits unavailable: ${reasonMessage(logRes.reason)}`,
    );
  }

  const recentTags: RepoSnapshotTag[] =
    tagsRes.status === 'fulfilled' && tagsRes.value.mode === 'list'
      ? (tagsRes.value.tags ?? []).map((tag) => {
          const entry: RepoSnapshotTag = { name: tag.name };
          const date = toIsoDate(tag.timestamp);
          if (date) entry.date = date;
          if (tag.tagger) entry.tagger = tag.tagger;
          if (tag.message) entry.annotationSubject = tag.message;
          if (tag.annotationBody) entry.annotationBody = tag.annotationBody;
          return entry;
        })
      : [];

  if (tagsRes.status === 'rejected') {
    warnings.push(`recent tags unavailable: ${reasonMessage(tagsRes.reason)}`);
  }

  let remotes: RepoSnapshotRemote[] | undefined;
  if (options.includeRemotes) {
    if (
      remotesRes.status === 'fulfilled' &&
      remotesRes.value &&
      remotesRes.value.mode === 'list'
    ) {
      remotes = (remotesRes.value.remotes ?? []).map((r) => ({
        name: r.name,
        fetchUrl: r.fetchUrl,
        pushUrl: r.pushUrl,
      }));
    } else if (remotesRes.status === 'rejected') {
      warnings.push(`remotes unavailable: ${reasonMessage(remotesRes.reason)}`);
      remotes = [];
    } else {
      remotes = [];
    }
  }

  const snapshot: RepoSnapshot = {
    status,
    recentCommits,
    recentTags,
    ...(remotes !== undefined ? { remotes } : {}),
  };

  return { snapshot, warnings };
}
