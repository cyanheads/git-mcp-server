/**
 * @fileoverview Tests for the advertised `tools/list` payload.
 *
 * Regression guard for cyanheads/git-mcp-server#57: the SDK's built-in
 * conversion tagged every schema `draft-07`, and clients validating with an
 * Ajv 2020 instance (Claude Desktop) rejected the dialect before reading the
 * schema and disabled the whole server. Every advertised schema must carry the
 * 2020-12 dialect, compile on a 2020-12-only validator, and stay byte-identical
 * to the SDK's own conversion apart from the `$schema` value.
 * @module tests/mcp-server/tools/utils/toolListing.test
 */
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { allToolDefinitions } from '@/mcp-server/tools/definitions/index.js';
import type { ToolDefinition } from '@/mcp-server/tools/utils/toolDefinition.js';
import {
  JSON_SCHEMA_2020_12,
  buildToolListing,
  deriveToolTitle,
} from '@/mcp-server/tools/utils/toolListing.js';

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#';

type JsonObject = Record<string, unknown>;

function withoutDialect(schema: unknown): JsonObject {
  const { $schema: _dialect, ...rest } = schema as JsonObject;
  return rest;
}

/** A validator with only the 2020-12 meta-schema registered — the Claude Desktop configuration. */
function createStrict2020Validator() {
  return new Ajv2020({ strict: false, validateFormats: false });
}

function makeTool(
  overrides: Partial<ToolDefinition> & { name: string },
): ToolDefinition {
  return {
    description: `${overrides.name} description`,
    inputSchema: z.object({ value: z.string().describe('A value.') }).strict(),
    outputSchema: z.object({ ok: z.boolean().describe('Outcome.') }),
    logic: async () => ({ ok: true }),
    ...overrides,
  };
}

describe('buildToolListing', () => {
  const listing = buildToolListing(allToolDefinitions);

  it('advertises every registered tool definition once, in order', () => {
    expect(listing.tools.map((tool) => tool.name)).toEqual(
      allToolDefinitions.map((tool) => tool.name),
    );
    expect(listing.tools.length).toBeGreaterThan(0);
  });

  it('carries name, title, and description for every tool', () => {
    for (const tool of listing.tools) {
      expect(tool.name).toMatch(/^git_[a-z_]+$/);
      expect(tool.title).toBeTruthy();
      expect(tool.description).toBeTruthy();
    }
  });

  describe('JSON Schema dialect (#57)', () => {
    it('tags every inputSchema and outputSchema with the 2020-12 dialect', () => {
      for (const tool of listing.tools) {
        expect(tool.inputSchema.$schema).toBe(JSON_SCHEMA_2020_12);
        expect(tool.outputSchema?.$schema).toBe(JSON_SCHEMA_2020_12);
      }
    });

    it('emits no draft-07 reference anywhere in the payload', () => {
      expect(JSON.stringify(listing)).not.toContain('draft-07');
    });

    it('compiles on a validator that only knows JSON Schema 2020-12', () => {
      const ajv = createStrict2020Validator();
      for (const tool of listing.tools) {
        expect(() => ajv.compile(tool.inputSchema)).not.toThrow();
        expect(() => ajv.compile(tool.outputSchema!)).not.toThrow();
      }
    });

    it('control: the same validator rejects a draft-07-tagged schema', () => {
      const ajv = createStrict2020Validator();
      const [first] = listing.tools;
      const draft07 = {
        ...withoutDialect(first!.outputSchema),
        $schema: DRAFT_07,
      };
      expect(() => ajv.compile(draft07)).toThrow(/draft-07/);
    });
  });

  describe('parity with the SDK conversion', () => {
    it('matches the SDK inputSchema byte-for-byte apart from $schema', () => {
      for (const [index, tool] of allToolDefinitions.entries()) {
        const sdk = toJsonSchemaCompat(tool.inputSchema, {
          strictUnions: true,
          pipeStrategy: 'input',
        });
        expect(withoutDialect(listing.tools[index]!.inputSchema)).toEqual(
          withoutDialect(sdk),
        );
      }
    });

    it('matches the SDK outputSchema byte-for-byte apart from $schema', () => {
      for (const [index, tool] of allToolDefinitions.entries()) {
        const sdk = toJsonSchemaCompat(tool.outputSchema, {
          strictUnions: true,
          pipeStrategy: 'output',
        });
        expect(withoutDialect(listing.tools[index]!.outputSchema)).toEqual(
          withoutDialect(sdk),
        );
      }
    });

    it('keeps every input schema strict (additionalProperties: false)', () => {
      for (const tool of listing.tools) {
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.additionalProperties).toBe(false);
      }
    });

    it('serializes input defaults and output optionality per direction', () => {
      const tool = makeTool({
        name: 'git_io_probe',
        inputSchema: z
          .object({
            verbose: z.boolean().default(false).describe('Defaulted.'),
          })
          .strict(),
        outputSchema: z.object({
          note: z.string().optional().describe('Optional.'),
        }),
      });
      const [entry] = buildToolListing([tool]).tools;
      expect(entry!.inputSchema.required).toBeUndefined();
      expect(
        (entry!.inputSchema.properties as JsonObject).verbose,
      ).toMatchObject({ type: 'boolean', default: false });
      expect(entry!.outputSchema?.required).toBeUndefined();
    });
  });

  describe('title and annotations', () => {
    it('prefers an explicit title', () => {
      const [entry] = buildToolListing([
        makeTool({
          name: 'git_probe',
          title: 'Explicit',
          annotations: { title: 'From Annotations' },
        }),
      ]).tools;
      expect(entry!.title).toBe('Explicit');
    });

    it('falls back to annotations.title', () => {
      const [entry] = buildToolListing([
        makeTool({
          name: 'git_probe',
          annotations: { title: 'From Annotations' },
        }),
      ]).tools;
      expect(entry!.title).toBe('From Annotations');
    });

    it('derives a title from the name when neither is set', () => {
      const [entry] = buildToolListing([
        makeTool({ name: 'git_set_working_dir' }),
      ]).tools;
      expect(entry!.title).toBe('Git Set Working Dir');
    });

    it('passes annotations through and omits the key when absent', () => {
      const [withHints, without] = buildToolListing([
        makeTool({ name: 'git_a', annotations: { readOnlyHint: true } }),
        makeTool({ name: 'git_b' }),
      ]).tools;
      expect(withHints!.annotations).toEqual({ readOnlyHint: true });
      expect(without).not.toHaveProperty('annotations');
    });
  });
});

describe('deriveToolTitle', () => {
  it('title-cases underscore-separated names', () => {
    expect(deriveToolTitle('git_status')).toBe('Git Status');
    expect(deriveToolTitle('git_set_working_dir')).toBe('Git Set Working Dir');
  });

  it('leaves a single word capitalized', () => {
    expect(deriveToolTitle('git')).toBe('Git');
  });
});
