import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GitOperations } from './git-operations.js';
import { logger } from './utils/logger.js';
import { CommandError } from './utils/command.js';
import {
  isInitOptions,
  isCloneOptions,
  isAddOptions,
  isCommitOptions,
  isPushPullOptions,
  isBranchOptions,
  isCheckoutOptions,
  isTagOptions,
  isRemoteOptions,
  isStashOptions,
  isPathOnly,
  isBulkActionOptions,
  BasePathOptions,
} from './types.js';

const PATH_DESCRIPTION = `MUST be an absolute path (e.g., /Users/username/projects/my-repo)`;
const FILE_PATH_DESCRIPTION = `MUST be an absolute path (e.g., /Users/username/projects/my-repo/src/file.js)`;

export class ToolHandler {
  private static readonly TOOL_PREFIX = 'git_mcp_server';

  constructor(private server: Server) {
    this.setupHandlers();
  }

  private getOperationName(toolName: string): string {
    return `${ToolHandler.TOOL_PREFIX}.${toolName}`;
  }

  private validateArguments<T extends BasePathOptions>(operation: string, args: unknown, validator: (obj: any) => obj is T): T {
    if (!args || !validator(args)) {
      const error = new McpError(
        ErrorCode.InvalidParams,
        `Invalid arguments for operation: ${operation}`
      );
      logger.error(operation, 'Argument validation failed', undefined, error, { args });
      throw error;
    }

    // If path is not provided, use default path from environment
    if (!args.path && process.env.GIT_DEFAULT_PATH) {
      args.path = process.env.GIT_DEFAULT_PATH;
      logger.info(operation, 'Using default git path', args.path);
    }

    return args;
  }

  private setupHandlers(): void {
    this.setupToolDefinitions();
    this.setupToolExecutor();
  }

  private setupToolDefinitions(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'init',
          description: 'Initialize a new Git repository',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to initialize the repository in. ${PATH_DESCRIPTION}`,
              },
            },
            required: [],
          },
        },
        {
          name: 'clone',
          description: 'Clone a repository',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL of the repository to clone',
              },
              path: {
                type: 'string',
                description: `Path to clone into. ${PATH_DESCRIPTION}`,
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'status',
          description: 'Get repository status',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
            },
            required: [],
          },
        },
        {
          name: 'add',
          description: 'Stage files',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              files: {
                type: 'array',
                items: {
                  type: 'string',
                  description: FILE_PATH_DESCRIPTION,
                },
                description: 'Files to stage',
              },
            },
            required: ['files'],
          },
        },
        {
          name: 'commit',
          description: 'Create a commit',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              message: {
                type: 'string',
                description: 'Commit message',
              },
            },
            required: ['message'],
          },
        },
        {
          name: 'push',
          description: 'Push commits to remote',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              remote: {
                type: 'string',
                description: 'Remote name',
                default: 'origin',
              },
              branch: {
                type: 'string',
                description: 'Branch name',
              },
            },
            required: ['branch'],
          },
        },
        {
          name: 'pull',
          description: 'Pull changes from remote',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              remote: {
                type: 'string',
                description: 'Remote name',
                default: 'origin',
              },
              branch: {
                type: 'string',
                description: 'Branch name',
              },
            },
            required: ['branch'],
          },
        },
        {
          name: 'branch_list',
          description: 'List all branches',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
            },
            required: [],
          },
        },
        {
          name: 'branch_create',
          description: 'Create a new branch',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              name: {
                type: 'string',
                description: 'Branch name',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'branch_delete',
          description: 'Delete a branch',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              name: {
                type: 'string',
                description: 'Branch name',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'checkout',
          description: 'Switch branches or restore working tree files',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              target: {
                type: 'string',
                description: 'Branch name, commit hash, or file path',
              },
            },
            required: ['target'],
          },
        },
        {
          name: 'tag_list',
          description: 'List tags',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
            },
            required: [],
          },
        },
        {
          name: 'tag_create',
          description: 'Create a tag',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              name: {
                type: 'string',
                description: 'Tag name',
              },
              message: {
                type: 'string',
                description: 'Tag message',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'tag_delete',
          description: 'Delete a tag',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              name: {
                type: 'string',
                description: 'Tag name',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'remote_list',
          description: 'List remotes',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
            },
            required: [],
          },
        },
        {
          name: 'remote_add',
          description: 'Add a remote',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              name: {
                type: 'string',
                description: 'Remote name',
              },
              url: {
                type: 'string',
                description: 'Remote URL',
              },
            },
            required: ['name', 'url'],
          },
        },
        {
          name: 'remote_remove',
          description: 'Remove a remote',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              name: {
                type: 'string',
                description: 'Remote name',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'stash_list',
          description: 'List stashes',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
            },
            required: [],
          },
        },
        {
          name: 'stash_save',
          description: 'Save changes to stash',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              message: {
                type: 'string',
                description: 'Stash message',
              },
            },
            required: [],
          },
        },
        {
          name: 'stash_pop',
          description: 'Apply and remove a stash',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              index: {
                type: 'number',
                description: 'Stash index',
                default: 0,
              },
            },
            required: [],
          },
        },
        // New bulk action tool
        {
          name: 'bulk_action',
          description: 'Execute multiple Git operations in sequence. This is the preferred way to execute multiple operations.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: `Path to repository. ${PATH_DESCRIPTION}`,
              },
              actions: {
                type: 'array',
                description: 'Array of Git operations to execute in sequence',
                items: {
                  type: 'object',
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        type: { const: 'stage' },
                        files: {
                          type: 'array',
                          items: {
                            type: 'string',
                            description: FILE_PATH_DESCRIPTION,
                          },
                          description: 'Files to stage. If not provided, stages all changes.',
                        },
                      },
                      required: ['type'],
                    },
                    {
                      type: 'object',
                      properties: {
                        type: { const: 'commit' },
                        message: {
                          type: 'string',
                          description: 'Commit message',
                        },
                      },
                      required: ['type', 'message'],
                    },
                    {
                      type: 'object',
                      properties: {
                        type: { const: 'push' },
                        remote: {
                          type: 'string',
                          description: 'Remote name',
                          default: 'origin',
                        },
                        branch: {
                          type: 'string',
                          description: 'Branch name',
                        },
                      },
                      required: ['type', 'branch'],
                    },
                  ],
                },
                minItems: 1,
              },
            },
            required: ['actions'],
          },
        },
      ],
    }));
  }

  private setupToolExecutor(): void {
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const operation = this.getOperationName(request.params.name);
      const args = request.params.arguments;
      const context = { operation, path: args?.path as string | undefined };

      try {
        switch (request.params.name) {
          case 'init': {
            const validArgs = this.validateArguments(operation, args, isInitOptions);
            return await GitOperations.init(validArgs, context);
          }

          case 'clone': {
            const validArgs = this.validateArguments(operation, args, isCloneOptions);
            return await GitOperations.clone(validArgs, context);
          }

          case 'status': {
            const validArgs = this.validateArguments(operation, args, isPathOnly);
            return await GitOperations.status(validArgs, context);
          }

          case 'add': {
            const validArgs = this.validateArguments(operation, args, isAddOptions);
            return await GitOperations.add(validArgs, context);
          }

          case 'commit': {
            const validArgs = this.validateArguments(operation, args, isCommitOptions);
            return await GitOperations.commit(validArgs, context);
          }

          case 'push': {
            const validArgs = this.validateArguments(operation, args, isPushPullOptions);
            return await GitOperations.push(validArgs, context);
          }

          case 'pull': {
            const validArgs = this.validateArguments(operation, args, isPushPullOptions);
            return await GitOperations.pull(validArgs, context);
          }

          case 'branch_list': {
            const validArgs = this.validateArguments(operation, args, isPathOnly);
            return await GitOperations.branchList(validArgs, context);
          }

          case 'branch_create': {
            const validArgs = this.validateArguments(operation, args, isBranchOptions);
            return await GitOperations.branchCreate(validArgs, context);
          }

          case 'branch_delete': {
            const validArgs = this.validateArguments(operation, args, isBranchOptions);
            return await GitOperations.branchDelete(validArgs, context);
          }

          case 'checkout': {
            const validArgs = this.validateArguments(operation, args, isCheckoutOptions);
            return await GitOperations.checkout(validArgs, context);
          }

          case 'tag_list': {
            const validArgs = this.validateArguments(operation, args, isPathOnly);
            return await GitOperations.tagList(validArgs, context);
          }

          case 'tag_create': {
            const validArgs = this.validateArguments(operation, args, isTagOptions);
            return await GitOperations.tagCreate(validArgs, context);
          }

          case 'tag_delete': {
            const validArgs = this.validateArguments(operation, args, isTagOptions);
            return await GitOperations.tagDelete(validArgs, context);
          }

          case 'remote_list': {
            const validArgs = this.validateArguments(operation, args, isPathOnly);
            return await GitOperations.remoteList(validArgs, context);
          }

          case 'remote_add': {
            const validArgs = this.validateArguments(operation, args, isRemoteOptions);
            return await GitOperations.remoteAdd(validArgs, context);
          }

          case 'remote_remove': {
            const validArgs = this.validateArguments(operation, args, isRemoteOptions);
            return await GitOperations.remoteRemove(validArgs, context);
          }

          case 'stash_list': {
            const validArgs = this.validateArguments(operation, args, isPathOnly);
            return await GitOperations.stashList(validArgs, context);
          }

          case 'stash_save': {
            const validArgs = this.validateArguments(operation, args, isStashOptions);
            return await GitOperations.stashSave(validArgs, context);
          }

          case 'stash_pop': {
            const validArgs = this.validateArguments(operation, args, isStashOptions);
            return await GitOperations.stashPop(validArgs, context);
          }

          case 'bulk_action': {
            const validArgs = this.validateArguments(operation, args, isBulkActionOptions);
            return await GitOperations.executeBulkActions(validArgs, context);
          }

          default:
            logger.error(operation, `Unknown tool: ${request.params.name}`);
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        if (error instanceof CommandError) {
          throw new McpError(ErrorCode.InternalError, error.message);
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Git operation failed: ${(error as Error).message}`
        );
      }
    });
  }
}
