/**
 * @fileoverview Unit tests for git-wrapup prompt definition
 * @module tests/mcp-server/prompts/definitions/git-wrapup.prompt.test
 */
import { describe, it, expect } from 'vitest';

import { gitWrapupPrompt } from '@/mcp-server/prompts/definitions/git-wrapup.prompt.js';

function getText(messages: unknown): string {
  const arr = messages as Array<{
    role: string;
    content: { type: string; text: string };
  }>;
  return arr[0]!.content.text;
}

describe('git_wrapup prompt', () => {
  describe('Metadata', () => {
    it('has correct name', () => {
      expect(gitWrapupPrompt.name).toBe('git_wrapup');
    });

    it('has a description', () => {
      expect(gitWrapupPrompt.description).toBeTruthy();
      expect(gitWrapupPrompt.description.length).toBeGreaterThan(20);
    });

    it('has valid arguments schema', () => {
      expect(gitWrapupPrompt.argumentsSchema).toBeDefined();
    });
  });

  describe('Arguments Schema', () => {
    it('accepts empty args (all optional)', () => {
      const result = gitWrapupPrompt.argumentsSchema!.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts changelogPath', () => {
      const result = gitWrapupPrompt.argumentsSchema!.safeParse({
        changelogPath: 'docs/CHANGELOG.md',
      });
      expect(result.success).toBe(true);
    });

    it('accepts all arguments', () => {
      const result = gitWrapupPrompt.argumentsSchema!.safeParse({
        changelogPath: 'CHANGELOG.md',
        createTag: 'false',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Generate', () => {
    it('returns a single user message with default args', () => {
      const messages = gitWrapupPrompt.generate({}) as Array<{
        role: string;
        content: { type: string };
      }>;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.role).toBe('user');
      expect(messages[0]!.content.type).toBe('text');
    });

    it('includes CHANGELOG.md as default path', () => {
      expect(getText(gitWrapupPrompt.generate({}))).toContain('CHANGELOG.md');
    });

    it('uses custom changelog path when provided', () => {
      expect(
        getText(gitWrapupPrompt.generate({ changelogPath: 'docs/HISTORY.md' })),
      ).toContain('docs/HISTORY.md');
    });

    it('invokes git_wrapup_instructions to load the protocol', () => {
      const text = getText(gitWrapupPrompt.generate({}));
      expect(text).toContain('git_wrapup_instructions');
      expect(text).toContain('acceptance-criteria');
    });

    it('describes the acceptance-criteria philosophy', () => {
      const text = getText(gitWrapupPrompt.generate({}));
      expect(text).toContain('strict on outcomes');
      expect(text).toContain('generic on mechanism');
    });

    it('references project-specific convention sources', () => {
      const text = getText(gitWrapupPrompt.generate({}));
      expect(text).toMatch(/AGENTS\.md|CLAUDE\.md/);
    });

    it('includes tag step by default', () => {
      const text = getText(gitWrapupPrompt.generate({}));
      expect(text).toContain('annotated git tag');
    });

    it('excludes tag step when createTag is "false"', () => {
      const text = getText(gitWrapupPrompt.generate({ createTag: 'false' }));
      expect(text).not.toContain('annotated git tag');
    });

    it('passes createTag: false through to the tool call when disabled', () => {
      const text = getText(gitWrapupPrompt.generate({ createTag: 'false' }));
      expect(text).toContain('createTag: false');
    });

    it('includes core workflow steps', () => {
      const text = getText(gitWrapupPrompt.generate({}));
      expect(text).toContain('Load Protocol');
      expect(text).toContain('Set Working Directory');
      expect(text).toContain('Analyze Changes');
      expect(text).toContain('Satisfy the Acceptance Criteria');
      expect(text).toContain('Commit Atomically');
      expect(text).toContain('Verify Clean');
    });

    it('does not reference removed tool input parameters', () => {
      const text = getText(gitWrapupPrompt.generate({}));
      expect(text).not.toContain('updateAgentMetaFiles');
    });
  });
});
