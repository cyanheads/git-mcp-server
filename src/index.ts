#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ToolHandler } from './tool-handler.js';
import { logger } from './utils/logger.js';
import { CommandExecutor } from './utils/command.js';
import { PathResolver } from './utils/paths.js';

async function validateDefaultPath(): Promise<void> {
  const defaultPath = process.env.GIT_DEFAULT_PATH;
  if (!defaultPath) {
    logger.warn('startup', 'GIT_DEFAULT_PATH not set - absolute paths will be required for all operations');
    return;
  }

  try {
    // Validate the default path exists and is accessible
    PathResolver.validatePath(defaultPath, 'startup', {
      mustExist: true,
      mustBeDirectory: true,
      createIfMissing: true
    });
    logger.info('startup', 'Default git path validated', defaultPath);
  } catch (error) {
    logger.error('startup', 'Invalid GIT_DEFAULT_PATH', defaultPath, error as Error);
    throw new McpError(
      ErrorCode.InternalError,
      `Invalid GIT_DEFAULT_PATH: ${(error as Error).message}`
    );
  }
}

async function main() {
  try {
    // Validate git installation first
    await CommandExecutor.validateGitInstallation('startup');
    logger.info('startup', 'Git installation validated');

    // Validate default path if provided
    await validateDefaultPath();

    // Create and configure server
    const server = new Server(
      {
        name: 'git-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up error handling
    server.onerror = (error) => {
      if (error instanceof McpError) {
        logger.error('server', error.message, undefined, error);
      } else {
        logger.error('server', 'Unexpected error', undefined, error as Error);
      }
    };

    // Initialize tool handler
    new ToolHandler(server);

    // Connect server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('server', 'Git MCP server running on stdio');

    // Handle shutdown
    process.on('SIGINT', async () => {
      logger.info('server', 'Shutting down server');
      await server.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('startup', 'Failed to start server', undefined, error as Error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
