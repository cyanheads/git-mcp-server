/**
 * Branch Tools
 * ===========
 * 
 * MCP tools for Git branch operations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GitService } from '../services/git-service.js';
import { Schemas, PathValidation } from '../utils/validation.js';

/**
 * Registers branch tools with the MCP server
 * 
 * @param server - MCP server instance
 */
export function setupBranchTools(server: McpServer): void {
  // List branches
  server.tool(
    "git_branch_list",
    "List branches in a repository. Displays both local and optionally remote branches, clearly marking the current branch.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      all: z.boolean().optional().default(false).describe("Whether to include remote branches in the list")
    },
    async ({ path, all }) => {
      try {
        const normalizedPath = PathValidation.normalizePath(path);
        const gitService = new GitService(normalizedPath);
        
        // Check if this is a git repository
        const isRepo = await gitService.isGitRepository();
        if (!isRepo) {
          return {
            content: [{
              type: "text",
              text: `Error: Not a Git repository: ${normalizedPath}`
            }],
            isError: true
          };
        }
        
        const result = await gitService.listBranches(all);
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        if (result.resultData.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No branches found in repository at: ${normalizedPath}`
            }]
          };
        }
        
        // Get status to determine current branch
        const statusResult = await gitService.getStatus();
        const currentBranch = statusResult.resultSuccessful ? statusResult.resultData.current : null;
        
        // Format output
        let output = `Branches in repository at: ${normalizedPath}\n\n`;
        result.resultData.forEach(branch => {
          if (branch === currentBranch) {
            output += `* ${branch} (current)\n`;
          } else {
            output += `  ${branch}\n`;
          }
        });
        
        return {
          content: [{
            type: "text",
            text: output
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : JSON.stringify(error, null, 2)}`
          }],
          isError: true
        };
      }
    }
  );
  
  // Create branch
  server.tool(
    "git_branch_create",
    "Create a new branch. Creates a new branch at the specified reference point (commit or branch) and optionally checks it out.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      name: z.string().min(1, "Branch name is required").describe("Name of the new branch to create"),
      startPoint: z.string().optional().describe("Reference (commit, branch) to create the branch from"),
      checkout: z.boolean().optional().default(false).describe("Whether to checkout the newly created branch")
    },
    async ({ path, name, startPoint, checkout }) => {
      try {
        const normalizedPath = PathValidation.normalizePath(path);
        const gitService = new GitService(normalizedPath);
        
        // Check if this is a git repository
        const isRepo = await gitService.isGitRepository();
        if (!isRepo) {
          return {
            content: [{
              type: "text",
              text: `Error: Not a Git repository: ${normalizedPath}`
            }],
            isError: true
          };
        }
        
        const result = await gitService.createBranch({
          name,
          startPoint,
          checkout
        });
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        return {
          content: [{
            type: "text",
            text: `Successfully created branch '${name}'${checkout ? ' and checked it out' : ''}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : JSON.stringify(error, null, 2)}`
          }],
          isError: true
        };
      }
    }
  );
  
  // Checkout branch
  server.tool(
    "git_checkout",
    "Checkout a branch, tag, or commit. Switches the working directory to the specified target and updates HEAD to point to it. Can optionally create a new branch.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      target: z.string().min(1, "Branch or commit to checkout is required").describe("Branch name, tag, or commit hash to checkout"),
      createBranch: z.boolean().optional().default(false).describe("Whether to create a new branch with the specified name")
    },
    async ({ path, target, createBranch }) => {
      try {
        const normalizedPath = PathValidation.normalizePath(path);
        const gitService = new GitService(normalizedPath);
        
        // Check if this is a git repository
        const isRepo = await gitService.isGitRepository();
        if (!isRepo) {
          return {
            content: [{
              type: "text",
              text: `Error: Not a Git repository: ${normalizedPath}`
            }],
            isError: true
          };
        }
        
        const result = await gitService.checkout(target, createBranch);
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        return {
          content: [{
            type: "text",
            text: `Successfully checked out '${target}'${createBranch ? ' (new branch)' : ''}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : JSON.stringify(error, null, 2)}`
          }],
          isError: true
        };
      }
    }
  );
  
  // Delete branch
  server.tool(
    "git_branch_delete",
    "Delete a branch. Removes the specified branch from the repository. By default, only fully merged branches can be deleted unless force is set to true.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      branch: z.string().min(1, "Branch name is required").describe("Name of the branch to delete"),
      force: z.boolean().optional().default(false).describe("Force deletion even if branch is not fully merged")
    },
    async ({ path, branch, force }) => {
      try {
        const normalizedPath = PathValidation.normalizePath(path);
        const gitService = new GitService(normalizedPath);
        
        // Check if this is a git repository
        const isRepo = await gitService.isGitRepository();
        if (!isRepo) {
          return {
            content: [{
              type: "text",
              text: `Error: Not a Git repository: ${normalizedPath}`
            }],
            isError: true
          };
        }
        
        const result = await gitService.deleteBranch(branch, force);
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        return {
          content: [{
            type: "text",
            text: `Successfully deleted branch '${branch}'`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : JSON.stringify(error, null, 2)}`
          }],
          isError: true
        };
      }
    }
  );
  
  // Merge branch
  server.tool(
    "git_merge",
    "Merge a branch into the current branch. Combines changes from the specified branch into the current branch with configurable merge strategies.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      branch: z.string().min(1, "Branch to merge is required").describe("Name of the branch to merge into the current branch"),
      message: z.string().optional().describe("Custom commit message for the merge commit"),
      fastForwardOnly: z.boolean().optional().default(false).describe("Only allow fast-forward merges (fail if not possible)"),
      noFastForward: z.boolean().optional().default(false).describe("Create a merge commit even when fast-forward is possible")
    },
    async ({ path, branch, message, fastForwardOnly, noFastForward }) => {
      try {
        const normalizedPath = PathValidation.normalizePath(path);
        const gitService = new GitService(normalizedPath);
        
        // Check if this is a git repository
        const isRepo = await gitService.isGitRepository();
        if (!isRepo) {
          return {
            content: [{
              type: "text",
              text: `Error: Not a Git repository: ${normalizedPath}`
            }],
            isError: true
          };
        }
        
        // Can't have both fastForwardOnly and noFastForward
        if (fastForwardOnly && noFastForward) {
          return {
            content: [{
              type: "text",
              text: `Error: Cannot specify both fastForwardOnly and noFastForward`
            }],
            isError: true
          };
        }
        
        const result = await gitService.merge({
          branch,
          message,
          fastForwardOnly,
          noFastForward
        });
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        return {
          content: [{
            type: "text",
            text: `Successfully merged branch '${branch}' into current branch`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : JSON.stringify(error, null, 2)}`
          }],
          isError: true
        };
      }
    }
  );
}
