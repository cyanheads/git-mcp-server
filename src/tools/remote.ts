/**
 * Remote Tools
 * ===========
 * 
 * MCP tools for Git remote operations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GitService } from '../services/git-service.js';
import { Schemas, PathValidation } from '../utils/validation.js';

/**
 * Registers remote operation tools with the MCP server
 * 
 * @param server - MCP server instance
 */
export function setupRemoteTools(server: McpServer): void {
  // Add a remote
  server.tool(
    "git_remote_add",
    "Add a new remote repository reference. Creates a connection to a remote repository with a name and URL, allowing fetching and pushing changes to and from that repository.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      name: z.string().min(1, "Remote name is required").describe("Name for the remote repository (e.g., 'origin')"),
      url: z.string().url("Invalid URL format").describe("URL of the remote repository")
    },
    async ({ path, name, url }) => {
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
        
        const result = await gitService.addRemote({
          name,
          url
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
            text: `Successfully added remote '${name}' with URL '${url}'`
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
  
  // List remotes
  server.tool(
    "git_remote_list",
    "List all configured remote repositories. Displays the names and URLs of all remotes associated with the repository, showing both fetch and push URLs.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository")
    },
    async ({ path }) => {
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
        
        const result = await gitService.listRemotes();
        
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
              text: `No remotes found in repository at: ${normalizedPath}`
            }]
          };
        }
        
        // Format output
        let output = `Remotes in repository at: ${normalizedPath}\n\n`;
        result.resultData.forEach(remote => {
          output += `${remote.name}\n`;
          output += `  fetch: ${remote.refs.fetch}\n`;
          output += `  push: ${remote.refs.push}\n\n`;
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
  
  // Fetch from remote
  server.tool(
    "git_fetch",
    "Fetch changes from a remote repository. Downloads objects and refs from a remote repository without merging them into local branches.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      remote: z.string().optional().default("origin").describe("Name of the remote to fetch from (defaults to 'origin')"),
      branch: z.string().optional().describe("Specific branch to fetch (fetches all branches if omitted)")
    },
    async ({ path, remote, branch }) => {
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
        
        const result = await gitService.fetch(remote, branch);
        
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
            text: `Successfully fetched from remote '${remote}'${branch ? ` branch '${branch}'` : ''}`
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
  
  // Pull from remote
  server.tool(
    "git_pull",
    "Pull changes from a remote repository. Fetches from a remote repository and integrates changes into the current branch, either by merging or rebasing.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      remote: z.string().optional().describe("Name of the remote to pull from (defaults to origin)"),
      branch: z.string().optional().describe("Branch to pull from (defaults to current tracking branch)"),
      rebase: z.boolean().optional().default(false).describe("Whether to use rebase instead of merge when pulling")
    },
    async ({ path, remote, branch, rebase }) => {
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
        
        const result = await gitService.pull({
          remote,
          branch,
          rebase
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
            text: `Successfully pulled changes${remote ? ` from remote '${remote}'` : ''}${branch ? ` branch '${branch}'` : ''}${rebase ? ' with rebase' : ''}`
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
  
  // Push to remote
  server.tool(
    "git_push",
    "Push local changes to a remote repository. Uploads local branch commits to the remote repository, updating remote references.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      remote: z.string().optional().default("origin").describe("Name of the remote to push to (defaults to 'origin')"),
      branch: z.string().optional().describe("Branch to push (defaults to current branch)"),
      force: z.boolean().optional().default(false).describe("Force push changes, overwriting remote history"),
      setUpstream: z.boolean().optional().default(false).describe("Set upstream tracking for the branch being pushed")
    },
    async ({ path, remote, branch, force, setUpstream }) => {
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
        
        const result = await gitService.push({
          remote,
          branch,
          force,
          setUpstream
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
            text: `Successfully pushed changes to remote '${remote}'${branch ? ` branch '${branch}'` : ''}${force ? ' (force push)' : ''}${setUpstream ? ' (set upstream)' : ''}`
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
