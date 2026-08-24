/**
 * @fileoverview Pins the `validateGitArgs` allow-list to what the CLI provider
 * actually emits. Every `-`-prefixed literal anywhere under
 * `src/services/git/providers/cli/` — the operations, the pre-flight
 * validators, and the provider itself — must pass the validator. A flag the
 * provider uses but the allow-list omits is a runtime failure for that tool
 * path that mocked-`execGit` unit tests never see (2.15.2 shipped exactly that:
 * `git rev-parse --is-inside-work-tree` in the validators was never swept, so
 * `git_set_working_dir` failed on every path).
 * @module tests/services/git/providers/cli/utils/allow-list-coverage.test
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateGitArgs } from '@/services/git/providers/cli/utils/command-builder.js';

/** The whole CLI provider — every file that can reach `executeGitCommand`. */
const OPERATIONS_DIR = 'src/services/git/providers/cli';
const ALLOW_LIST_FILE = join(OPERATIONS_DIR, 'utils', 'command-builder.ts');

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listSourceFiles(full, out);
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Every quoted or template literal that starts like a git flag, keyed to the files emitting it. */
function collectFlagLiterals(): Map<string, string[]> {
  const flags = new Map<string, string[]>();
  for (const file of listSourceFiles(OPERATIONS_DIR)) {
    if (file === ALLOW_LIST_FILE) continue; // the list itself is not an emitter
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(/['"`](-{1,2}[A-Za-z][\w-]*|--)/g)) {
      const flag = match[1]!;
      const where = flags.get(flag) ?? [];
      where.push(relative(OPERATIONS_DIR, file));
      flags.set(flag, where);
    }
  }
  return flags;
}

describe('validateGitArgs allow-list covers every flag the operations emit', () => {
  const flags = collectFlagLiterals();

  it('finds the operation sources', () => {
    expect(flags.size).toBeGreaterThan(50);
  });

  it('sweeps the pre-flight validators and the provider, not only operations/', () => {
    const files = new Set([...flags.values()].flat());
    expect(files).toContain('utils/git-validators.ts');
    expect(files).toContain('CliGitProvider.ts');
    expect(flags.has('--is-inside-work-tree')).toBe(true);
  });

  it('accepts every rev-parse probe the validators emit', () => {
    expect(() =>
      validateGitArgs(['rev-parse', '--is-inside-work-tree']),
    ).not.toThrow();
    expect(() =>
      validateGitArgs(['rev-parse', '--show-toplevel']),
    ).not.toThrow();
    expect(() =>
      validateGitArgs(['rev-parse', '--verify', 'refs/heads/main']),
    ).not.toThrow();
  });

  it('a message that starts with "-" is safe when attached to --message=', () => {
    expect(() =>
      validateGitArgs(['--message=-fix: leading dash']),
    ).not.toThrow();
    expect(() => validateGitArgs(['--message=--amend'])).not.toThrow();
    // The two-argv form the operations used to emit is exactly what the
    // validator must keep rejecting — the message would parse as a flag.
    expect(() => validateGitArgs(['-m', '-fix: leading dash'])).toThrow(
      /Unsafe git flag/i,
    );
  });

  it('no operation emits a message as a standalone argv entry after -m', () => {
    for (const file of listSourceFiles(OPERATIONS_DIR)) {
      const source = stripComments(readFileSync(file, 'utf8'));
      expect(source, relative(OPERATIONS_DIR, file)).not.toMatch(
        /'-m',\s*(?:options\.)?message\b/,
      );
    }
  });

  for (const [flag, files] of [...flags.entries()].sort()) {
    it(`accepts ${flag} (${[...new Set(files)].join(', ')})`, () => {
      expect(() => validateGitArgs([flag])).not.toThrow();
    });
  }

  it('short flags emitted with an attached value are accepted', () => {
    expect(() => validateGitArgs(['-n10'])).not.toThrow();
    expect(() => validateGitArgs(['-L1,5'])).not.toThrow();
    expect(() => validateGitArgs(['-L1,'])).not.toThrow();
  });

  it('attached-value short flags in the sources are limited to the known forms', () => {
    const letters = new Set<string>();
    for (const file of listSourceFiles(OPERATIONS_DIR)) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const match of source.matchAll(/`-([A-Za-z])\$\{/g)) {
        letters.add(match[1]!);
      }
    }
    expect([...letters].sort()).toEqual(['L', 'n']);
  });

  it('an attached value does not widen the short-flag rule', () => {
    expect(() => validateGitArgs(['-oProxyCommand=evil'])).toThrow(
      /Unsafe git flag/i,
    );
    expect(() => validateGitArgs(['-n10x'])).toThrow(/Unsafe git flag/i);
  });

  it('flags carrying a value are matched on the flag name', () => {
    expect(() => validateGitArgs(['--untracked-files=no'])).not.toThrow();
    expect(() => validateGitArgs(['--porcelain=v2'])).not.toThrow();
    expect(() => validateGitArgs(['--count=5'])).not.toThrow();
    expect(() => validateGitArgs(['--sort=-version:refname'])).not.toThrow();
  });
});
