/**
 * @fileoverview Unit tests for common schema definitions
 * @module tests/mcp-server/tools/schemas/common.test
 *
 * Tests JSON Schema compatibility to ensure schemas work with clients
 * using different JSON Schema draft versions (Draft 4 vs Draft 7).
 *
 * Issue #34: Go clients using Draft 4 parsers fail when `exclusiveMinimum`
 * is a number (Draft 7) instead of boolean (Draft 4).
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  LimitSchema,
  SkipSchema,
  DepthSchema,
  CommitMessageSchema,
  normalizeMessage,
} from '@/mcp-server/tools/schemas/common.js';

/**
 * Helper to convert a Zod schema to JSON Schema and extract a field's constraints
 */
function getJsonSchemaProperty(
  schema: z.ZodTypeAny,
  fieldName: string,
): Record<string, unknown> | undefined {
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7' });
  const properties = jsonSchema.properties as Record<
    string,
    Record<string, unknown>
  >;
  return properties?.[fieldName];
}

describe('Common Schemas - JSON Schema Compatibility', () => {
  /**
   * These tests verify that numeric schemas use `minimum` instead of `exclusiveMinimum`
   * for cross-client compatibility. The issue is:
   *
   * - Draft 7: `exclusiveMinimum: 0` (number) - means "must be > 0"
   * - Draft 4: `exclusiveMinimum: true, minimum: 0` (boolean) - same meaning
   *
   * Go's JSON Schema parser expects Draft 4 format and fails to unmarshal
   * when `exclusiveMinimum` is a number.
   *
   * Solution: Use `.min(1)` instead of `.positive()` to output `minimum: 1`
   * which is compatible with all JSON Schema drafts.
   */

  describe('LimitSchema', () => {
    const testSchema = z.object({ limit: LimitSchema });

    it('should use minimum instead of exclusiveMinimum for Draft 4 compatibility', () => {
      const jsonProp = getJsonSchemaProperty(testSchema, 'limit');

      expect(jsonProp).toBeDefined();
      expect(jsonProp!.minimum).toBe(1);
      expect(jsonProp!.exclusiveMinimum).toBeUndefined();
    });

    it('should have correct maximum constraint', () => {
      const jsonProp = getJsonSchemaProperty(testSchema, 'limit');

      expect(jsonProp!.maximum).toBe(1000);
    });

    it('should be an integer type', () => {
      const jsonProp = getJsonSchemaProperty(testSchema, 'limit');

      expect(jsonProp!.type).toBe('integer');
    });

    it('should validate values correctly', () => {
      // Valid values
      expect(LimitSchema.safeParse(1).success).toBe(true);
      expect(LimitSchema.safeParse(500).success).toBe(true);
      expect(LimitSchema.safeParse(1000).success).toBe(true);
      expect(LimitSchema.safeParse(undefined).success).toBe(true); // optional

      // Invalid values
      expect(LimitSchema.safeParse(0).success).toBe(false); // below minimum
      expect(LimitSchema.safeParse(-1).success).toBe(false); // negative
      expect(LimitSchema.safeParse(1001).success).toBe(false); // above maximum
      expect(LimitSchema.safeParse(1.5).success).toBe(false); // not integer
    });
  });

  describe('DepthSchema', () => {
    const testSchema = z.object({ depth: DepthSchema });

    it('should use minimum instead of exclusiveMinimum for Draft 4 compatibility', () => {
      const jsonProp = getJsonSchemaProperty(testSchema, 'depth');

      expect(jsonProp).toBeDefined();
      expect(jsonProp!.minimum).toBe(1);
      expect(jsonProp!.exclusiveMinimum).toBeUndefined();
    });

    it('should be an integer type', () => {
      const jsonProp = getJsonSchemaProperty(testSchema, 'depth');

      expect(jsonProp!.type).toBe('integer');
    });

    it('should validate values correctly', () => {
      // Valid values
      expect(DepthSchema.safeParse(1).success).toBe(true);
      expect(DepthSchema.safeParse(100).success).toBe(true);
      expect(DepthSchema.safeParse(undefined).success).toBe(true); // optional

      // Invalid values
      expect(DepthSchema.safeParse(0).success).toBe(false); // below minimum
      expect(DepthSchema.safeParse(-1).success).toBe(false); // negative
      expect(DepthSchema.safeParse(1.5).success).toBe(false); // not integer
    });
  });

  describe('SkipSchema', () => {
    const testSchema = z.object({ skip: SkipSchema });

    it('should use minimum for non-negative constraint', () => {
      const jsonProp = getJsonSchemaProperty(testSchema, 'skip');

      expect(jsonProp).toBeDefined();
      expect(jsonProp!.minimum).toBe(0);
      // nonnegative() is inclusive, so no exclusiveMinimum needed
      expect(jsonProp!.exclusiveMinimum).toBeUndefined();
    });

    it('should be an integer type', () => {
      const jsonProp = getJsonSchemaProperty(testSchema, 'skip');

      expect(jsonProp!.type).toBe('integer');
    });

    it('should validate values correctly', () => {
      // Valid values
      expect(SkipSchema.safeParse(0).success).toBe(true); // zero allowed
      expect(SkipSchema.safeParse(1).success).toBe(true);
      expect(SkipSchema.safeParse(100).success).toBe(true);
      expect(SkipSchema.safeParse(undefined).success).toBe(true); // optional

      // Invalid values
      expect(SkipSchema.safeParse(-1).success).toBe(false); // negative
      expect(SkipSchema.safeParse(1.5).success).toBe(false); // not integer
    });
  });
});

describe('normalizeMessage', () => {
  it('should convert literal \\n to actual newlines', () => {
    expect(normalizeMessage('line1\\nline2')).toBe('line1\nline2');
  });

  it('should convert literal \\n\\n to double newlines', () => {
    expect(normalizeMessage('title\\n\\nbody')).toBe('title\n\nbody');
  });

  it('should convert literal \\t to tab', () => {
    expect(normalizeMessage('col1\\tcol2')).toBe('col1\tcol2');
  });

  it('should convert literal \\r to carriage return', () => {
    expect(normalizeMessage('line1\\rline2')).toBe('line1\rline2');
  });

  it('should convert literal \\r\\n to a single newline', () => {
    expect(normalizeMessage('line1\\r\\nline2')).toBe('line1\nline2');
  });

  it('should preserve strings that already have real newlines', () => {
    expect(normalizeMessage('line1\nline2')).toBe('line1\nline2');
  });

  it('should handle mixed literal and real newlines', () => {
    expect(normalizeMessage('line1\nline2\\nline3')).toBe(
      'line1\nline2\nline3',
    );
  });

  it('should return empty string unchanged', () => {
    expect(normalizeMessage('')).toBe('');
  });

  it('should return simple single-line messages unchanged', () => {
    expect(normalizeMessage('fix: resolve bug')).toBe('fix: resolve bug');
  });

  it('should handle a realistic multi-line commit message with literal escapes', () => {
    const input =
      'feat: add user authentication\\n\\nImplemented OAuth2 flow with JWT tokens.\\nAdded tests for login and logout.';
    const expected =
      'feat: add user authentication\n\nImplemented OAuth2 flow with JWT tokens.\nAdded tests for login and logout.';
    expect(normalizeMessage(input)).toBe(expected);
  });
});

describe('CommitMessageSchema', () => {
  it('should normalize literal \\n in parsed messages', () => {
    const result = CommitMessageSchema.parse('title\\n\\nbody');
    expect(result).toBe('title\n\nbody');
  });

  it('should pass through messages with real newlines', () => {
    const result = CommitMessageSchema.parse('title\n\nbody');
    expect(result).toBe('title\n\nbody');
  });

  it('should reject empty messages', () => {
    expect(CommitMessageSchema.safeParse('').success).toBe(false);
  });

  it('should reject messages exceeding max length', () => {
    expect(CommitMessageSchema.safeParse('x'.repeat(10001)).success).toBe(
      false,
    );
  });
});

describe('Tool-specific Schema Compatibility', () => {
  /**
   * Test that tool-specific numeric fields also avoid exclusiveMinimum.
   * This imports the actual tool schemas to verify the fix propagates.
   */

  describe('git_cherry_pick mainline field', () => {
    it('should use minimum instead of exclusiveMinimum', async () => {
      const { gitCherryPickTool } =
        await import('@/mcp-server/tools/definitions/git-cherry-pick.tool.js');

      const testSchema = z.object({
        mainline: gitCherryPickTool.inputSchema.shape.mainline,
      });

      const jsonProp = getJsonSchemaProperty(testSchema, 'mainline');

      expect(jsonProp).toBeDefined();
      expect(jsonProp!.minimum).toBe(1);
      expect(jsonProp!.exclusiveMinimum).toBeUndefined();
    });

    it('should validate mainline values correctly', async () => {
      const { gitCherryPickTool } =
        await import('@/mcp-server/tools/definitions/git-cherry-pick.tool.js');

      const mainlineSchema = gitCherryPickTool.inputSchema.shape.mainline;

      // Valid values (parent numbers start at 1)
      expect(mainlineSchema.safeParse(1).success).toBe(true);
      expect(mainlineSchema.safeParse(2).success).toBe(true);
      expect(mainlineSchema.safeParse(undefined).success).toBe(true);

      // Invalid values
      expect(mainlineSchema.safeParse(0).success).toBe(false); // parent 0 doesn't exist
      expect(mainlineSchema.safeParse(-1).success).toBe(false);
    });
  });

  describe('git_clone depth field', () => {
    it('should use minimum instead of exclusiveMinimum', async () => {
      const { gitCloneTool } =
        await import('@/mcp-server/tools/definitions/git-clone.tool.js');

      const testSchema = z.object({
        depth: gitCloneTool.inputSchema.shape.depth,
      });

      const jsonProp = getJsonSchemaProperty(testSchema, 'depth');

      expect(jsonProp).toBeDefined();
      expect(jsonProp!.minimum).toBe(1);
      expect(jsonProp!.exclusiveMinimum).toBeUndefined();
    });
  });

  describe('git_fetch depth field', () => {
    it('should use minimum instead of exclusiveMinimum', async () => {
      const { gitFetchTool } =
        await import('@/mcp-server/tools/definitions/git-fetch.tool.js');

      const testSchema = z.object({
        depth: gitFetchTool.inputSchema.shape.depth,
      });

      const jsonProp = getJsonSchemaProperty(testSchema, 'depth');

      expect(jsonProp).toBeDefined();
      expect(jsonProp!.minimum).toBe(1);
      expect(jsonProp!.exclusiveMinimum).toBeUndefined();
    });
  });

  describe('git_log maxCount field', () => {
    it('should use minimum instead of exclusiveMinimum', async () => {
      const { gitLogTool } =
        await import('@/mcp-server/tools/definitions/git-log.tool.js');

      const testSchema = z.object({
        maxCount: gitLogTool.inputSchema.shape.maxCount,
      });

      const jsonProp = getJsonSchemaProperty(testSchema, 'maxCount');

      expect(jsonProp).toBeDefined();
      expect(jsonProp!.minimum).toBe(1);
      expect(jsonProp!.exclusiveMinimum).toBeUndefined();
    });
  });

  describe('git_reflog maxCount field', () => {
    it('should use minimum instead of exclusiveMinimum', async () => {
      const { gitReflogTool } =
        await import('@/mcp-server/tools/definitions/git-reflog.tool.js');

      const testSchema = z.object({
        maxCount: gitReflogTool.inputSchema.shape.maxCount,
      });

      const jsonProp = getJsonSchemaProperty(testSchema, 'maxCount');

      expect(jsonProp).toBeDefined();
      expect(jsonProp!.minimum).toBe(1);
      expect(jsonProp!.exclusiveMinimum).toBeUndefined();
    });
  });
});
