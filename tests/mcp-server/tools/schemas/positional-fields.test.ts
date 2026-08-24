/**
 * @fileoverview Fleet-wide pin: every tool input field whose value can reach
 * git as a positional argument rejects a leading `-`, so an argument like
 * `--upload-pack=<cmd>` cannot be smuggled in as a ref, path, or URL.
 *
 * The exception list names the fields that are allowed to accept a leading
 * dash: the repository `path` (used as the working directory, never an
 * argument) and values git receives as option values (`-m <message>`,
 * `--author=<x>`, `--since=<x>`, `--initial-branch=<x>`), which git's parser
 * never re-interprets as flags. Any new string field must be classified here.
 * @module tests/mcp-server/tools/schemas/positional-fields.test
 */
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { allToolDefinitions } from '@/mcp-server/tools/definitions/index.js';

const PAYLOAD = '--upload-pack=touch /tmp/pwned';

const ALLOWED_TO_ACCEPT_LEADING_DASH: Record<string, string[]> = {
  git_add: ['path'],
  git_blame: ['path'],
  git_branch: ['path'],
  git_changelog_analyze: ['path'],
  git_checkout: ['path'],
  git_cherry_pick: ['path'],
  git_clean: ['path'],
  git_clear_working_dir: [],
  git_clone: [],
  git_commit: ['path', 'message', 'author'],
  git_diff: ['path'],
  git_fetch: ['path'],
  git_init: ['path', 'initialBranch'],
  git_log: ['path', 'since', 'until', 'author', 'grep'],
  git_merge: ['path', 'message'],
  git_pull: ['path'],
  git_push: ['path'],
  git_rebase: ['path'],
  git_reflog: ['path'],
  git_remote: ['path'],
  git_reset: ['path'],
  git_set_working_dir: ['path'],
  git_show: ['path'],
  git_stash: ['path', 'message'],
  git_status: ['path'],
  git_tag: ['path', 'message'],
  git_worktree: ['path'],
  git_wrapup_instructions: [],
};

function acceptsLeadingDash(field: z.ZodTypeAny): boolean {
  const candidates: unknown[] = [
    PAYLOAD,
    [PAYLOAD],
    { name: PAYLOAD, email: PAYLOAD },
  ];
  return candidates.some((candidate) => field.safeParse(candidate).success);
}

describe('positional tool input fields reject a leading dash', () => {
  it('classifies every tool', () => {
    expect(Object.keys(ALLOWED_TO_ACCEPT_LEADING_DASH).sort()).toEqual(
      allToolDefinitions.map((tool) => tool.name).sort(),
    );
  });

  for (const tool of allToolDefinitions) {
    it(`${tool.name}: only the classified fields accept "${PAYLOAD}"`, () => {
      const shape = tool.inputSchema.shape as Record<string, z.ZodTypeAny>;
      const accepting = Object.entries(shape)
        .filter(([, field]) => acceptsLeadingDash(field))
        .map(([key]) => key)
        .sort();
      expect(accepting).toEqual(
        [...(ALLOWED_TO_ACCEPT_LEADING_DASH[tool.name] ?? [])].sort(),
      );
    });
  }
});
