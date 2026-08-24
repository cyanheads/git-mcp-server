/**
 * @fileoverview End-to-end regression for cyanheads/git-mcp-server#57 over the
 * real stdio transport: a real MCP SDK client spawns the server, lists its
 * tools, and calls one. Every advertised schema must carry the JSON Schema
 * 2020-12 dialect and compile on a 2020-12-only validator, and a `tools/call`
 * round-trip must still pass the client's `structuredContent` validation
 * against the advertised `outputSchema`.
 * @module tests/mcp-server/transports/stdio/tool-listing.e2e.test
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { allToolDefinitions } from '@/mcp-server/tools/definitions/index.js';
import { JSON_SCHEMA_2020_12 } from '@/mcp-server/tools/utils/toolListing.js';

const STARTUP_TIMEOUT_MS = 30_000;

describe('stdio transport: advertised tool schemas (#57)', () => {
  let client: Client;
  let tools: Tool[];
  let repoDir: string;

  beforeAll(async () => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mcp-e2e-'));
    const init = Bun.spawnSync(['git', 'init', '-q', repoDir]);
    expect(init.exitCode).toBe(0);

    client = new Client({ name: 'tool-listing-e2e', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: 'bun',
        args: ['src/index.ts'],
        cwd: process.cwd(),
        env: {
          ...(process.env as Record<string, string>),
          MCP_TRANSPORT_TYPE: 'stdio',
          MCP_LOG_LEVEL: 'error',
        },
        stderr: 'pipe',
      }),
    );
    tools = (await client.listTools()).tools;
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await client?.close();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('lists every tool definition', () => {
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      allToolDefinitions.map((tool) => tool.name).sort(),
    );
  });

  it('tags every inputSchema and outputSchema with the 2020-12 dialect', () => {
    for (const tool of tools) {
      expect(tool.inputSchema.$schema).toBe(JSON_SCHEMA_2020_12);
      expect(tool.outputSchema?.$schema).toBe(JSON_SCHEMA_2020_12);
    }
    expect(JSON.stringify(tools)).not.toContain('draft-07');
  });

  it('every advertised schema compiles on a 2020-12-only validator', () => {
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    for (const tool of tools) {
      expect(() => ajv.compile(tool.inputSchema)).not.toThrow();
      expect(() => ajv.compile(tool.outputSchema!)).not.toThrow();
    }
  });

  it(
    'tools/call round-trips and the client validates structuredContent against the advertised outputSchema',
    async () => {
      const result = await client.callTool({
        name: 'git_status',
        arguments: { path: repoDir },
      });

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({
        success: true,
        isClean: true,
        untrackedFiles: [],
      });
    },
    STARTUP_TIMEOUT_MS,
  );

  it(
    'tools/call rejects an undeclared argument (strict input schema)',
    async () => {
      const outcome = await client
        .callTool({
          name: 'git_status',
          arguments: { path: repoDir, notAnArgument: true },
        })
        .then((result) => ({ threw: false, isError: result.isError === true }))
        .catch(() => ({ threw: true, isError: true }));

      expect(outcome.isError).toBe(true);
    },
    STARTUP_TIMEOUT_MS,
  );
});
