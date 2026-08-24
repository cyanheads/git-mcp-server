/**
 * @fileoverview Builds the `tools/list` result this server advertises, emitting
 * every tool's `inputSchema` / `outputSchema` as JSON Schema 2020-12 — the MCP
 * default dialect (SEP-1613).
 *
 * The MCP SDK 1.x `tools/list` handler converts Zod schemas with a hardcoded
 * `draft-7` target and no override, so every advertised schema carried
 * `"$schema": "http://json-schema.org/draft-07/schema#"`. A client whose
 * validator only registers the 2020-12 meta-schema (Ajv 2020) refuses that
 * dialect label before reading the schema body and disables the whole server
 * at registration. Zod's 2020-12 output is byte-identical to its draft-7
 * output for every schema here apart from the `$schema` value.
 * @module src/mcp-server/tools/utils/toolListing
 */
import type { ListToolsResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { ToolDefinition } from './toolDefinition.js';

/** The `$schema` URI every advertised tool schema carries. */
export const JSON_SCHEMA_2020_12 =
  'https://json-schema.org/draft/2020-12/schema';

/**
 * Human-readable title fallback for a tool that declares neither `title` nor
 * `annotations.title`: `git_set_working_dir` → `Git Set Working Dir`.
 */
export function deriveToolTitle(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Converts tool definitions into the `tools/list` wire shape.
 *
 * Mirrors the SDK's conversion parameters (`io: 'input'` for inputs,
 * `io: 'output'` for outputs) so defaults and optionality serialize the same
 * way; only the JSON Schema target differs.
 */
export function buildToolListing(
  toolDefs: readonly ToolDefinition[],
): ListToolsResult {
  return {
    tools: toolDefs.map((tool) => ({
      name: tool.name,
      title:
        tool.title ?? tool.annotations?.title ?? deriveToolTitle(tool.name),
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.inputSchema, {
        target: 'draft-2020-12',
        io: 'input',
      }) as Tool['inputSchema'],
      outputSchema: z.toJSONSchema(tool.outputSchema, {
        target: 'draft-2020-12',
        io: 'output',
      }) as Tool['outputSchema'],
      ...(tool.annotations && { annotations: tool.annotations }),
    })),
  };
}
