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
        skipDocumentation: 'true',
        createTag: 'true',
        updateAgentFiles: 'true',
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

    it('includes documentation section by default', () => {
      expect(getText(gitWrapupPrompt.generate({}))).toContain(
        'Review Documentation',
      );
    });

    it('excludes documentation section when skipDocumentation is true', () => {
      expect(
        getText(gitWrapupPrompt.generate({ skipDocumentation: 'true' })),
      ).not.toContain('Review Documentation');
    });

    it('excludes agent files section by default', () => {
      expect(getText(gitWrapupPrompt.generate({}))).not.toContain(
        'Update Agent Files',
      );
    });

    it('includes agent files section when updateAgentFiles is true', () => {
      expect(
        getText(gitWrapupPrompt.generate({ updateAgentFiles: 'true' })),
      ).toContain('Update Agent Files');
    });

    it('excludes tag section by default', () => {
      expect(getText(gitWrapupPrompt.generate({}))).not.toContain(
        'annotated git tag',
      );
    });

    it('includes tag section when createTag is true', () => {
      expect(
        getText(gitWrapupPrompt.generate({ createTag: 'true' })),
      ).toContain('annotated git tag');
    });

    it('includes core workflow steps', () => {
      const text = getText(gitWrapupPrompt.generate({}));
      expect(text).toContain('Initialize Context');
      expect(text).toContain('Set Working Directory');
      expect(text).toContain('Analyze Changes');
      expect(text).toContain('Commit Changes');
      expect(text).toContain('Verify Completion');
    });
  });
});
