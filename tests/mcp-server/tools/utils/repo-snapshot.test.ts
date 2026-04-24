/**
 * @fileoverview Unit tests for the gatherRepoSnapshot helper.
 * Covers limits being pushed to the provider, partial failure surfacing,
 * not-a-repo collapse, and the upstream/ahead/behind round-trip from status.
 * @module tests/mcp-server/tools/utils/repo-snapshot.test
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { gatherRepoSnapshot } from '@/mcp-server/tools/utils/repo-snapshot.js';
import type {
  GitLogResult,
  GitRemoteResult,
  GitStatusResult,
  GitTagResult,
} from '@/services/git/types.js';
import {
  createMockGitProvider,
  createTestContext,
} from '../definitions/helpers/index.js';

const cleanStatus: GitStatusResult = {
  currentBranch: 'main',
  upstream: 'origin/main',
  ahead: 1,
  behind: 2,
  isClean: true,
  stagedChanges: {},
  unstagedChanges: {},
  untrackedFiles: [],
  conflictedFiles: [],
};

const dirtyStatus: GitStatusResult = {
  currentBranch: 'feat',
  isClean: false,
  stagedChanges: { added: ['a.ts'], modified: ['b.ts'] },
  unstagedChanges: { modified: ['c.ts'] },
  untrackedFiles: ['d.ts'],
  conflictedFiles: ['e.ts'],
};

const logResult: GitLogResult = {
  commits: [
    {
      hash: 'aaa1111',
      shortHash: 'aaa1111',
      author: 'Author One',
      authorEmail: 'one@example.com',
      timestamp: 1700000000,
      subject: 'feat: one',
      parents: [],
    },
    {
      hash: 'bbb2222',
      shortHash: 'bbb2222',
      author: 'Author Two',
      authorEmail: 'two@example.com',
      timestamp: 1700001000,
      subject: 'fix: two',
      parents: [],
    },
  ],
  totalCount: 2,
};

const tagResult: GitTagResult = {
  mode: 'list',
  tags: [
    {
      name: 'v2.0.0',
      commit: 'aaa1111',
      message: 'Big release',
      annotationBody: 'Notes spanning\nmultiple lines.',
      tagger: 'T <t@e.com>',
      timestamp: 1700000000,
    },
    {
      name: 'v1.0.0',
      commit: 'bbb2222',
      message: 'First release',
      tagger: 'T <t@e.com>',
      timestamp: 1690000000,
    },
  ],
};

const remoteResult: GitRemoteResult = {
  mode: 'list',
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'https://example.com/repo.git',
      pushUrl: 'https://example.com/repo.git',
    },
  ],
};

function primeAll(provider: ReturnType<typeof createMockGitProvider>) {
  provider.status.mockResolvedValue(cleanStatus);
  provider.log.mockResolvedValue(logResult);
  provider.tag.mockResolvedValue(tagResult);
  provider.remote.mockResolvedValue(remoteResult);
}

describe('gatherRepoSnapshot', () => {
  let provider: ReturnType<typeof createMockGitProvider>;

  beforeEach(() => {
    provider = createMockGitProvider();
    provider.resetMocks();
  });

  describe('happy path', () => {
    it('returns status, recent commits, recent tags, and no warnings', async () => {
      primeAll(provider);

      const { snapshot, warnings } = await gatherRepoSnapshot(
        {
          provider,
          appContext: createTestContext({ tenantId: 'test' }),
          workingDirectory: '/repo',
        },
        { commitLimit: 2, tagLimit: 2 },
      );

      expect(warnings).toEqual([]);
      expect(snapshot).toBeDefined();
      expect(snapshot!.status.branch).toBe('main');
      expect(snapshot!.status.upstream).toBe('origin/main');
      expect(snapshot!.status.ahead).toBe(1);
      expect(snapshot!.status.behind).toBe(2);
      expect(snapshot!.recentCommits).toHaveLength(2);
      expect(snapshot!.recentCommits[0]!.subject).toBe('feat: one');
      expect(snapshot!.recentTags).toHaveLength(2);
      expect(snapshot!.recentTags[0]!.annotationSubject).toBe('Big release');
      expect(snapshot!.recentTags[0]!.annotationBody).toBe(
        'Notes spanning\nmultiple lines.',
      );
      expect(snapshot!.remotes).toBeUndefined();
    });

    it('flattens dirty status into staged/unstaged/untracked/conflicts arrays', async () => {
      provider.status.mockResolvedValue(dirtyStatus);
      provider.log.mockResolvedValue({ commits: [], totalCount: 0 });
      provider.tag.mockResolvedValue({ mode: 'list', tags: [] });

      const { snapshot } = await gatherRepoSnapshot({
        provider,
        appContext: createTestContext({ tenantId: 'test' }),
        workingDirectory: '/repo',
      });

      expect(snapshot!.status.isClean).toBe(false);
      expect(snapshot!.status.staged).toEqual(['a.ts', 'b.ts']);
      expect(snapshot!.status.unstaged).toEqual(['c.ts']);
      expect(snapshot!.status.untracked).toEqual(['d.ts']);
      expect(snapshot!.status.conflicts).toEqual(['e.ts']);
    });

    it('includes remotes when includeRemotes is true', async () => {
      primeAll(provider);

      const { snapshot } = await gatherRepoSnapshot(
        {
          provider,
          appContext: createTestContext({ tenantId: 'test' }),
          workingDirectory: '/repo',
        },
        { includeRemotes: true },
      );

      expect(snapshot!.remotes).toEqual([
        {
          name: 'origin',
          fetchUrl: 'https://example.com/repo.git',
          pushUrl: 'https://example.com/repo.git',
        },
      ]);
    });

    it('skips the remote fetch entirely when includeRemotes is omitted', async () => {
      primeAll(provider);

      await gatherRepoSnapshot({
        provider,
        appContext: createTestContext({ tenantId: 'test' }),
        workingDirectory: '/repo',
      });

      expect(provider.remote).not.toHaveBeenCalled();
    });
  });

  describe('limits pushed to provider', () => {
    it('passes commitLimit as maxCount to provider.log', async () => {
      primeAll(provider);

      await gatherRepoSnapshot(
        {
          provider,
          appContext: createTestContext({ tenantId: 'test' }),
          workingDirectory: '/repo',
        },
        { commitLimit: 7 },
      );

      const [logArgs] = provider.log.mock.calls[0]!;
      expect(logArgs).toEqual({ maxCount: 7 });
    });

    it('passes tagLimit as limit to provider.tag', async () => {
      primeAll(provider);

      await gatherRepoSnapshot(
        {
          provider,
          appContext: createTestContext({ tenantId: 'test' }),
          workingDirectory: '/repo',
        },
        { tagLimit: 3 },
      );

      const [tagArgs] = provider.tag.mock.calls[0]!;
      expect(tagArgs).toEqual({ mode: 'list', limit: 3 });
    });

    it('defaults to commitLimit=2 and tagLimit=2', async () => {
      primeAll(provider);

      await gatherRepoSnapshot({
        provider,
        appContext: createTestContext({ tenantId: 'test' }),
        workingDirectory: '/repo',
      });

      const [logArgs] = provider.log.mock.calls[0]!;
      const [tagArgs] = provider.tag.mock.calls[0]!;
      expect(logArgs).toEqual({ maxCount: 2 });
      expect(tagArgs).toEqual({ mode: 'list', limit: 2 });
    });
  });

  describe('failure modes', () => {
    it('collapses all-failure with "not a git repository" into one hint and omits the snapshot', async () => {
      const notARepo = new Error(
        'fatal: not a git repository (or any of the parent directories)',
      );
      provider.status.mockRejectedValue(notARepo);
      provider.log.mockRejectedValue(notARepo);
      provider.tag.mockRejectedValue(notARepo);
      provider.remote.mockRejectedValue(notARepo);

      const { snapshot, warnings } = await gatherRepoSnapshot(
        {
          provider,
          appContext: createTestContext({ tenantId: 'test' }),
          workingDirectory: '/not-a-repo',
        },
        { includeRemotes: true },
      );

      expect(snapshot).toBeUndefined();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/git repository/);
    });

    it('surfaces per-field warnings on partial failure', async () => {
      provider.status.mockResolvedValue(cleanStatus);
      provider.log.mockResolvedValue(logResult);
      provider.tag.mockRejectedValue(new Error('tag listing exploded'));

      const { snapshot, warnings } = await gatherRepoSnapshot({
        provider,
        appContext: createTestContext({ tenantId: 'test' }),
        workingDirectory: '/repo',
      });

      expect(snapshot).toBeDefined();
      expect(snapshot!.status.branch).toBe('main');
      expect(snapshot!.recentCommits).toHaveLength(2);
      expect(snapshot!.recentTags).toEqual([]);
      expect(
        warnings.some((w) => w.includes('tag') && w.includes('exploded')),
      ).toBe(true);
    });

    it('falls back to empty status when status fails but other ops succeed', async () => {
      provider.status.mockRejectedValue(new Error('status failed'));
      provider.log.mockResolvedValue(logResult);
      provider.tag.mockResolvedValue(tagResult);

      const { snapshot, warnings } = await gatherRepoSnapshot({
        provider,
        appContext: createTestContext({ tenantId: 'test' }),
        workingDirectory: '/repo',
      });

      expect(snapshot).toBeDefined();
      expect(snapshot!.status.branch).toBeNull();
      expect(snapshot!.status.isClean).toBe(false);
      expect(warnings.some((w) => w.includes('status'))).toBe(true);
    });

    it('returns empty remotes array (and a warning) when remotes fail but includeRemotes was true', async () => {
      provider.status.mockResolvedValue(cleanStatus);
      provider.log.mockResolvedValue(logResult);
      provider.tag.mockResolvedValue(tagResult);
      provider.remote.mockRejectedValue(new Error('remote listing failed'));

      const { snapshot, warnings } = await gatherRepoSnapshot(
        {
          provider,
          appContext: createTestContext({ tenantId: 'test' }),
          workingDirectory: '/repo',
        },
        { includeRemotes: true },
      );

      expect(snapshot!.remotes).toEqual([]);
      expect(warnings.some((w) => w.includes('remotes'))).toBe(true);
    });
  });

  describe('tag annotation field shape', () => {
    it('omits annotationSubject and annotationBody for lightweight tags', async () => {
      provider.status.mockResolvedValue(cleanStatus);
      provider.log.mockResolvedValue({ commits: [], totalCount: 0 });
      provider.tag.mockResolvedValue({
        mode: 'list',
        tags: [
          {
            name: 'lightweight-tag',
            commit: 'abc1234',
          },
        ],
      });

      const { snapshot } = await gatherRepoSnapshot({
        provider,
        appContext: createTestContext({ tenantId: 'test' }),
        workingDirectory: '/repo',
      });

      expect(snapshot!.recentTags).toHaveLength(1);
      expect(snapshot!.recentTags[0]!.name).toBe('lightweight-tag');
      expect(snapshot!.recentTags[0]!.annotationSubject).toBeUndefined();
      expect(snapshot!.recentTags[0]!.annotationBody).toBeUndefined();
      expect(snapshot!.recentTags[0]!.date).toBeUndefined();
    });

    it('formats tag timestamps as ISO 8601', async () => {
      provider.status.mockResolvedValue(cleanStatus);
      provider.log.mockResolvedValue({ commits: [], totalCount: 0 });
      provider.tag.mockResolvedValue({
        mode: 'list',
        tags: [{ name: 'v1', commit: 'abc', timestamp: 1700000000 }],
      });

      const { snapshot } = await gatherRepoSnapshot({
        provider,
        appContext: createTestContext({ tenantId: 'test' }),
        workingDirectory: '/repo',
      });

      expect(snapshot!.recentTags[0]!.date).toBe('2023-11-14T22:13:20.000Z');
    });
  });
});
