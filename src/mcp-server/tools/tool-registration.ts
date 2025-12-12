/**
 * @fileoverview Encapsulates the registration of all tool definitions for the application's
 * dependency injection (DI) container and provides a registry service to apply them to an
 * McpServer instance.
 * @module src/mcp-server/tools/tool-registration
 */
import {
  McpServer,
  type ToolCallback,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type DependencyContainer, injectable, injectAll } from 'tsyringe';
import type { z } from 'zod';

import { ToolDefinitions } from '@/container/index.js';
import { JsonRpcErrorCode } from '@/types-global/errors.js';
import { ErrorHandler, logger, requestContextService } from '@/utils/index.js';
import { allToolDefinitions } from '@/mcp-server/tools/definitions/index.js';
import type { ToolDefinition } from '@/mcp-server/tools/utils/toolDefinition.js';
import { createMcpToolHandler } from '@/mcp-server/tools/utils/toolHandlerFactory.js';

@injectable()
export class ToolRegistry {
  constructor(
    @injectAll(ToolDefinitions, { isOptional: true })
    private toolDefs: ToolDefinition<
      z.ZodObject<z.ZodRawShape>,
      z.ZodObject<z.ZodRawShape>
    >[],
  ) {}

  /**
   * Registers all resolved tool definitions with the provided McpServer instance.
   * @param {McpServer} server - The server instance to register tools with.
   */
  public async registerAll(server: McpServer): Promise<void> {
    const context = requestContextService.createRequestContext({
      operation: 'ToolRegistry.registerAll',
    });
    logger.info(`Registering ${this.toolDefs.length} tool(s)...`, context);
    for (const toolDef of this.toolDefs) {
      await this.registerTool(server, toolDef);
    }
  }

  private deriveTitleFromName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private async registerTool<
    TInputSchema extends z.ZodObject<z.ZodRawShape>,
    TOutputSchema extends z.ZodObject<z.ZodRawShape>,
  >(
    server: McpServer,
    tool: ToolDefinition<TInputSchema, TOutputSchema>,
  ): Promise<void> {
    const registrationContext = requestContextService.createRequestContext({
      operation: 'ToolRegistry.registerTool',
      toolName: tool.name,
    });

    logger.debug(`Registering tool: '${tool.name}'`, registrationContext);

    await ErrorHandler.tryCatch(
      () => {
        const handler = createMcpToolHandler({
          toolName: tool.name,
          inputSchema: tool.inputSchema,
          logic: tool.logic,
          ...(tool.responseFormatter && {
            responseFormatter: tool.responseFormatter,
          }),
        });

        const title =
          tool.title ??
          tool.annotations?.title ??
          this.deriveTitleFromName(tool.name);

        server.registerTool(
          tool.name,
          {
            title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
            ...(tool.annotations && { annotations: tool.annotations }),
          },
          // Type assertion needed: SDK's conditional types don't resolve with generic constraints
          handler as ToolCallback<TInputSchema>,
        );

        logger.notice(
          `Tool '${tool.name}' registered successfully.`,
          registrationContext,
        );
      },
      {
        operation: `RegisteringTool_${tool.name}`,
        context: registrationContext,
        errorCode: JsonRpcErrorCode.InitializationFailed,
        critical: true,
      },
    );
  }
}

/**
 * Registers all tool definitions with the provided dependency container.
 * This function uses multi-injection to register each tool under the `ToolDefinitions` token.
 *
 * @param {DependencyContainer} container - The tsyringe container instance to register tools with.
 */
export const registerTools = (container: DependencyContainer): void => {
  for (const tool of allToolDefinitions) {
    container.register(ToolDefinitions, { useValue: tool });
  }
};
