/**
 * @fileoverview Pins the `validateGitArgs` allow-list to what the CLI
 * operations actually emit. Every `-`-prefixed literal in
 * `src/services/git/providers/cli/operations/` must pass the validator —
 * a flag the operations use but the allow-list omits is a runtime failure
 * for that tool path that mocked-`execGit` unit tests never see.
 * @module tests/services/git/providers/cli/utils/allow-list-coverage.test
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateGitArgs } from '@/services/git/providers/cli/utils/command-builder.js';

const OPERATIONS_DIR = 'src/services/git/providers/cli/operations';

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
