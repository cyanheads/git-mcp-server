/**
 * @fileoverview Tests for ToolRegistry's wiring against the MCP server:
 * every definition reaches `registerTool` with its Zod schemas intact, and the
 * SDK's `tools/list` handler is replaced afterwards by the 2020-12 listing
 * (cyanheads/git-mcp-server#57).
 * @module tests/mcp-server/tools/tool-registration.test
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ToolRegistry } from '@/mcp-server/tools/tool-registration.js';
import type { ToolDefinition } from '@/mcp-server/tools/utils/toolDefinition.js';
import {
  JSON_SCHEMA_2020_12,
  buildToolListing,
} from '@/mcp-server/tools/utils/toolListing.js';

type RequestHandler = () => unknown;

function createFakeServer() {
  const order: string[] = [];
  const registerTool = vi.fn(
    (name: string, _config: unknown, _handler: unknown) => {
      order.push(`registerTool:${name}`);
    },
  );
  const setRequestHandler = vi.fn(
    (_schema: unknown, _handler: RequestHandler) => {
      order.push('setRequestHandler');
    },
  );
  const server = {
    registerTool,
    server: { setRequestHandler },
  } as unknown as McpServer;
  return { server, registerTool, setRequestHandler, order };
}

function makeTool(
  name: string,
  extra: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    name,
    description: `${name} description`,
    inputSchema: z.object({ path: z.string().describe('Path.') }).strict(),
    outputSchema: z.object({ success: z.boolean().describe('Outcome.') }),
    logic: async () => ({ success: true }),
    ...extra,
  };
}

describe('ToolRegistry.registerAll', () => {
  const defs = [
    makeTool('git_alpha', {
      title: 'Alpha',
      annotations: { readOnlyHint: true },
    }),
    makeTool('git_beta'),
  ];

  it('registers every definition with its Zod schemas and resolved title', async () => {
    const { server, registerTool } = createFakeServer();
    await new ToolRegistry(defs).registerAll(server);

    expect(registerTool).toHaveBeenCalledTimes(defs.length);
    const [alphaName, alphaConfig] = registerTool.mock.calls[0]!;
    expect(alphaName).toBe('git_alpha');
    expect(alphaConfig).toMatchObject({
      title: 'Alpha',
      description: 'git_alpha description',
      inputSchema: defs[0]!.inputSchema,
      outputSchema: defs[0]!.outputSchema,
      annotations: { readOnlyHint: true },
    });

    const [, betaConfig] = registerTool.mock.calls[1]!;
    expect(betaConfig).toMatchObject({ title: 'Git Beta' });
    expect(betaConfig).not.toHaveProperty('annotations');
  });

  it('installs the tools/list handler after every tool is registered', async () => {
    const { server, setRequestHandler, order } = createFakeServer();
    await new ToolRegistry(defs).registerAll(server);

    expect(setRequestHandler).toHaveBeenCalledTimes(1);
    expect(setRequestHandler.mock.calls[0]![0]).toBe(ListToolsRequestSchema);
    expect(order).toEqual([
      'registerTool:git_alpha',
      'registerTool:git_beta',
      'setRequestHandler',
    ]);
  });

  it('the installed handler advertises the 2020-12 listing for the registered tools', async () => {
    const { server, setRequestHandler } = createFakeServer();
    await new ToolRegistry(defs).registerAll(server);

    const handler = setRequestHandler.mock.calls[0]![1] as RequestHandler;
    const result = handler() as ReturnType<typeof buildToolListing>;

    expect(result).toEqual(buildToolListing(defs));
    expect(result.tools.map((tool) => tool.name)).toEqual([
      'git_alpha',
      'git_beta',
    ]);
    for (const tool of result.tools) {
      expect(tool.inputSchema.$schema).toBe(JSON_SCHEMA_2020_12);
      expect(tool.outputSchema?.$schema).toBe(JSON_SCHEMA_2020_12);
    }
  });

  it('still installs the handler when no tools are registered', async () => {
    const { server, registerTool, setRequestHandler } = createFakeServer();
    await new ToolRegistry([]).registerAll(server);

    expect(registerTool).not.toHaveBeenCalled();
    const handler = setRequestHandler.mock.calls[0]![1] as RequestHandler;
    expect(handler()).toEqual({ tools: [] });
  });
});
