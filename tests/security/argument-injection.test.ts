/**
 * @fileoverview Argument injection defense — schema, validator, and argv ordering.
 * @module tests/security/argument-injection.test
 *
 * Threat model: an attacker controls a string that becomes a positional
 * argument to `git`. If the string starts with `-`, git's option parser
 * treats it as a flag — turning a "fetch this URL" or "checkout this ref"
 * operation into arbitrary code execution via flags like
 * `--upload-pack=`, `--config=core.sshCommand=`, `--exec=`.
 *
 * Related CVEs / advisories:
 *  - CVE-2017-1000117 — `git clone ssh://-oProxyCommand=…`
 *  - CVE-2018-17456 — `.gitmodules` argument injection
 *  - GHSA-86j2-w37r-q256 — this project, `git_clone url` (the bug these
 *    tests exist to prevent regressing).
 *
 * Defense layers (each test below pins one):
 *  1. Schema — input fields that go positional to git reject leading `-`
 *     and (for URLs) require a recognized scheme.
 *  2. Validator — `validateGitArgs` rejects any `-`-prefixed argument
 *     whose flag name is not on the allow-list, even when `=value`.
 *  3. Argv ordering — service operations emit `--end-of-options` between
 *     the option section and any user-controlled positional segment.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { validateGitArgs } from '@/services/git/providers/cli/utils/command-builder.js';
import { executeClone } from '@/services/git/providers/cli/operations/core/clone.js';
import { executeRemote } from '@/services/git/providers/cli/operations/remotes/remote.js';
import {
  BranchNameSchema,
  CommitRefSchema,
  GitFilePathSchema,
  GitUrlSchema,
  RemoteNameSchema,
  TagNameSchema,
} from '@/mcp-server/tools/schemas/common.js';
import { gitCloneTool } from '@/mcp-server/tools/definitions/git-clone.tool.js';
import { gitRemoteTool } from '@/mcp-server/tools/definitions/git-remote.tool.js';
import { gitCheckoutTool } from '@/mcp-server/tools/definitions/git-checkout.tool.js';
import { gitAddTool } from '@/mcp-server/tools/definitions/git-add.tool.js';
import type { GitOperationContext } from '@/services/git/types.js';
import type { RequestContext } from '@/utils/index.js';

/**
 * Canonical attack payloads. Every one of these has appeared in a real CVE,
 * a public PoC, or the GHSA-86j2-w37r-q256 advisory. They MUST be rejected.
 */
const ATTACK_PAYLOADS = [
  // GHSA-86j2-w37r-q256 PoC
  '--config=core.sshCommand=touch /tmp/pwned',
  // CVE-2017-1000117 canonical
  '-oProxyCommand=touch /tmp/pwned',
  'ssh://-oProxyCommand=touch /tmp/pwned',
  // Argument-injection variants documented across git CVEs
  '--upload-pack=touch /tmp/pwned',
  '--exec=touch /tmp/pwned',
  '--receive-pack=touch /tmp/pwned',
  '--server-option=core.sshCommand=evil',
  // Dash-only and minimal forms
  '-',
  '--',
  // Disguised as a URL
  '-https://github.com/foo/bar.git',
  // Smuggled via scp-style
  'git@host:-flag',
] as const;

describe('Argument injection defense', () => {
  /* ------------------------------------------------------------------ */
  /* Layer 1 — Schema rejection                                          */
  /* ------------------------------------------------------------------ */
  describe('Layer 1 — schemas reject malicious values', () => {
    describe('GitUrlSchema', () => {
      it.each(ATTACK_PAYLOADS)('rejects payload: %s', (payload) => {
        const result = GitUrlSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('accepts legitimate HTTPS URL', () => {
        expect(
          GitUrlSchema.safeParse('https://github.com/user/repo.git').success,
        ).toBe(true);
      });

      it('accepts legitimate SSH URL', () => {
        expect(
          GitUrlSchema.safeParse('ssh://git@github.com/user/repo.git').success,
        ).toBe(true);
      });

      it('accepts scp-style SSH URL', () => {
        expect(
          GitUrlSchema.safeParse('git@github.com:user/repo.git').success,
        ).toBe(true);
      });

      it('accepts file:// URL', () => {
        expect(GitUrlSchema.safeParse('file:///tmp/repo.git').success).toBe(
          true,
        );
      });

      it('accepts absolute filesystem path', () => {
        expect(GitUrlSchema.safeParse('/tmp/repo.git').success).toBe(true);
      });

      it('rejects unrecognized scheme', () => {
        expect(GitUrlSchema.safeParse('javascript:alert(1)').success).toBe(
          false,
        );
        expect(GitUrlSchema.safeParse('data:text/plain,evil').success).toBe(
          false,
        );
      });
    });

    describe('CommitRefSchema', () => {
      it('rejects leading-dash refs', () => {
        expect(CommitRefSchema.safeParse('--upload-pack=evil').success).toBe(
          false,
        );
        expect(CommitRefSchema.safeParse('-foo').success).toBe(false);
      });

      it('accepts legitimate refs', () => {
        expect(CommitRefSchema.safeParse('main').success).toBe(true);
        expect(CommitRefSchema.safeParse('HEAD~1').success).toBe(true);
        expect(CommitRefSchema.safeParse('abc1234').success).toBe(true);
        expect(
          CommitRefSchema.safeParse('refs/heads/feature/foo').success,
        ).toBe(true);
      });
    });

    describe('BranchNameSchema', () => {
      it('rejects leading-dash branch names', () => {
        expect(BranchNameSchema.safeParse('--evil').success).toBe(false);
        expect(BranchNameSchema.safeParse('-flag').success).toBe(false);
      });

      it('accepts legitimate branch names', () => {
        expect(BranchNameSchema.safeParse('main').success).toBe(true);
        expect(BranchNameSchema.safeParse('feature/foo').success).toBe(true);
      });
    });

    describe('TagNameSchema', () => {
      it('rejects leading-dash tag names', () => {
        expect(TagNameSchema.safeParse('--evil').success).toBe(false);
        expect(TagNameSchema.safeParse('-v1').success).toBe(false);
      });

      it('accepts legitimate tag names', () => {
        expect(TagNameSchema.safeParse('v1.0.0').success).toBe(true);
        expect(TagNameSchema.safeParse('release-2024').success).toBe(true);
      });
    });

    describe('RemoteNameSchema', () => {
      it('rejects leading-dash remote names', () => {
        expect(RemoteNameSchema.safeParse('-evil').success).toBe(false);
      });

      it('accepts legitimate remote names', () => {
        expect(RemoteNameSchema.safeParse('origin').success).toBe(true);
        expect(RemoteNameSchema.safeParse('upstream').success).toBe(true);
      });
    });

    describe('GitFilePathSchema', () => {
      it('rejects leading-dash file paths', () => {
        expect(GitFilePathSchema.safeParse('--cached').success).toBe(false);
        expect(GitFilePathSchema.safeParse('-foo').success).toBe(false);
      });

      it('accepts legitimate paths', () => {
        expect(GitFilePathSchema.safeParse('src/file.ts').success).toBe(true);
        expect(GitFilePathSchema.safeParse('./dotfile').success).toBe(true);
        expect(GitFilePathSchema.safeParse('.').success).toBe(true);
      });

      it('accepts dotfile-named-like-dash via leading "./"', () => {
        // Canonical git workaround for filenames starting with -
        expect(GitFilePathSchema.safeParse('./-foo').success).toBe(true);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Layer 1b — Tool input schemas reject malicious inputs               */
  /* ------------------------------------------------------------------ */
  describe('Layer 1b — tool input schemas reject argument-injection', () => {
    describe('git_clone', () => {
      it.each(ATTACK_PAYLOADS)('rejects url=%s', (payload) => {
        const result = gitCloneTool.inputSchema.safeParse({
          url: payload,
          path: '/tmp/dest',
        });
        expect(result.success).toBe(false);
      });

      it('rejects malicious branch values', () => {
        const result = gitCloneTool.inputSchema.safeParse({
          url: 'https://github.com/x/y.git',
          path: '/tmp/dest',
          branch: '--upload-pack=evil',
        });
        expect(result.success).toBe(false);
      });

      it('rejects malicious path values', () => {
        const result = gitCloneTool.inputSchema.safeParse({
          url: 'https://github.com/x/y.git',
          path: '--evil',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('git_remote', () => {
      it.each(ATTACK_PAYLOADS)('rejects url=%s on add operation', (payload) => {
        const result = gitRemoteTool.inputSchema.safeParse({
          mode: 'add',
          name: 'origin',
          url: payload,
        });
        expect(result.success).toBe(false);
      });

      it('rejects leading-dash remote name', () => {
        const result = gitRemoteTool.inputSchema.safeParse({
          mode: 'add',
          name: '-evil',
          url: 'https://github.com/x/y.git',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('git_checkout', () => {
      it('rejects leading-dash target (ref-injection)', () => {
        const result = gitCheckoutTool.inputSchema.safeParse({
          path: '.',
          target: '--upload-pack=evil',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('git_add', () => {
      it('rejects leading-dash path entries', () => {
        const result = gitAddTool.inputSchema.safeParse({
          path: '.',
          paths: ['--cached'],
        });
        expect(result.success).toBe(false);
      });

      it('rejects mixed legitimate + malicious paths', () => {
        const result = gitAddTool.inputSchema.safeParse({
          path: '.',
          paths: ['src/legit.ts', '--upload-pack=evil'],
        });
        expect(result.success).toBe(false);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Layer 2 — validateGitArgs catches anything that slipped past schemas */
  /* ------------------------------------------------------------------ */
  describe('Layer 2 — validateGitArgs rejects unsafe flags', () => {
    // The bare `--` is a schema-layer payload only: the validator must accept it
    // as the pathspec separator every path-taking operation emits.
    it.each(ATTACK_PAYLOADS.filter((p) => p.startsWith('-') && p !== '--'))(
      'rejects flag payload: %s',
      (payload) => {
        expect(() => validateGitArgs([payload])).toThrow(/Unsafe git flag/i);
      },
    );

    it('accepts the -- pathspec separator', () => {
      expect(() => validateGitArgs(['--'])).not.toThrow();
    });

    it('rejects null bytes', () => {
      expect(() => validateGitArgs(['main\0--upload-pack=evil'])).toThrow(
        /Null byte/i,
      );
    });

    it('accepts the --end-of-options separator', () => {
      expect(() => validateGitArgs(['--end-of-options'])).not.toThrow();
    });

    it('error message identifies the rejected flag for triage', () => {
      try {
        validateGitArgs(['--config=core.sshCommand=evil']);
        throw new Error('should have thrown');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain('--config');
        expect(msg.toLowerCase()).toContain('injection');
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Layer 3 — Service operations emit --end-of-options                  */
  /* ------------------------------------------------------------------ */
  describe('Layer 3 — service argv contains --end-of-options', () => {
    const mockContext: GitOperationContext = {
      workingDirectory: '/test/repo',
      requestContext: { requestId: 'test' } as RequestContext,
      tenantId: 'test-tenant',
    };

    type ExecGit = (
      args: string[],
      cwd: string,
      ctx: RequestContext,
    ) => Promise<{ stdout: string; stderr: string }>;

    let mockExec: ReturnType<typeof vi.fn<ExecGit>>;

    beforeEach(() => {
      mockExec = vi.fn<ExecGit>();
    });

    it('executeClone places --end-of-options before URL and path', async () => {
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeClone(
        {
          remoteUrl: 'https://github.com/x/y.git',
          localPath: '/tmp/dest',
        },
        mockContext,
        mockExec,
      );

      const [args] = mockExec.mock.calls[0]!;
      const endIdx = args.indexOf('--end-of-options');
      const urlIdx = args.indexOf('https://github.com/x/y.git');
      const pathIdx = args.indexOf('/tmp/dest');

      expect(endIdx).toBeGreaterThanOrEqual(0);
      expect(urlIdx).toBeGreaterThan(endIdx);
      expect(pathIdx).toBeGreaterThan(endIdx);
    });

    it('executeRemote add places --end-of-options before name and URL', async () => {
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeRemote(
        {
          mode: 'add',
          name: 'origin',
          url: 'https://github.com/x/y.git',
        },
        mockContext,
        mockExec,
      );

      const [args] = mockExec.mock.calls[0]!;
      const endIdx = args.indexOf('--end-of-options');
      const nameIdx = args.indexOf('origin');
      const urlIdx = args.indexOf('https://github.com/x/y.git');

      expect(endIdx).toBeGreaterThanOrEqual(0);
      expect(nameIdx).toBeGreaterThan(endIdx);
      expect(urlIdx).toBeGreaterThan(endIdx);
    });

    it('executeRemote set-url places --end-of-options before name and URL', async () => {
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await executeRemote(
        {
          mode: 'set-url',
          name: 'origin',
          url: 'https://github.com/x/y.git',
        },
        mockContext,
        mockExec,
      );

      const [args] = mockExec.mock.calls[0]!;
      const endIdx = args.indexOf('--end-of-options');
      const urlIdx = args.indexOf('https://github.com/x/y.git');

      expect(endIdx).toBeGreaterThanOrEqual(0);
      expect(urlIdx).toBeGreaterThan(endIdx);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Regression — the specific GHSA-86j2-w37r-q256 PoC                   */
  /* ------------------------------------------------------------------ */
  describe('Regression — GHSA-86j2-w37r-q256 PoC payload', () => {
    it('git_clone rejects the advisory PoC at the schema layer', () => {
      const result = gitCloneTool.inputSchema.safeParse({
        url: '--config=core.sshCommand=touch /tmp/git-mcp-clone-rce-poc',
        path: '/tmp/dest',
      });
      expect(result.success).toBe(false);
    });

    it('validateGitArgs would also reject the PoC if it reached the validator', () => {
      expect(() =>
        validateGitArgs([
          '--config=core.sshCommand=touch /tmp/git-mcp-clone-rce-poc',
        ]),
      ).toThrow(/Unsafe git flag/i);
    });
  });
});
