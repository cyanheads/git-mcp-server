/**
 * Advanced Git Tools
 * ================
 * 
 * MCP tools for advanced Git operations like stashing, tagging, rebasing, etc.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GitService } from '../services/git-service.js';
import { Schemas, PathValidation } from '../utils/validation.js';

/**
 * Registers advanced Git tools with the MCP server
 * 
 * @param server - MCP server instance
 */
export function setupAdvancedTools(server: McpServer): void {
  // Create tag
  server.tool(
    "git_tag_create",
    "Create a new tag in the repository. Tags are references that point to specific commits, useful for marking release points or important commits. Can create lightweight tags or annotated tags with messages.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      name: z.string().min(1, "Tag name is required").describe("Name for the new tag"),
      message: z.string().optional().describe("Optional message for an annotated tag"),
      ref: z.string().optional().describe("Reference (commit, branch) to create the tag at")
    },
    async ({ path, name, message, ref }) => {
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
        
        const result = await gitService.createTag({
          name,
          message,
          ref
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
            text: `Successfully created ${message ? 'annotated ' : ''}tag '${name}'${ref ? ` at ref '${ref}'` : ''}`
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
  
  // List tags
  server.tool(
    "git_tag_list",
    "List all tags in the repository. Displays all tag names that exist in the repository, which can be used to identify releases or important reference points.",
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
        
        const result = await gitService.listTags();
        
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
              text: `No tags found in repository at: ${normalizedPath}`
            }]
          };
        }
        
        // Format output
        let output = `Tags in repository at: ${normalizedPath}\n\n`;
        result.resultData.forEach(tag => {
          output += `${tag}\n`;
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
  
  // Create stash
  server.tool(
    "git_stash_create",
    "Save uncommitted changes to a stash. Captures the current state of working directory and index and saves it on a stack of stashes, allowing you to switch branches without committing in-progress work.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      message: z.string().optional().describe("Optional description for the stash"),
      includeUntracked: z.boolean().optional().default(false).describe("Whether to include untracked files in the stash")
    },
    async ({ path, message, includeUntracked }) => {
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
        
        const result = await gitService.createStash({
          message,
          includeUntracked
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
            text: `Successfully created stash${message ? ` with message: "${message}"` : ''}${includeUntracked ? ' (including untracked files)' : ''}`
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
  
  // List stashes
  server.tool(
    "git_stash_list",
    "List all stashes in the repository. Shows the stack of stashes that have been created and their descriptions, allowing you to identify the stash you want to apply or pop.",
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
        
        const result = await gitService.listStashes();
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        if (result.resultData.trim() === '') {
          return {
            content: [{
              type: "text",
              text: `No stashes found in repository at: ${normalizedPath}`
            }]
          };
        }
        
        return {
          content: [{
            type: "text",
            text: `Stashes in repository at: ${normalizedPath}\n\n${result.resultData}`
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
  
  // Apply stash
  server.tool(
    "git_stash_apply",
    "Apply stashed changes to the working directory. Applies changes from the specified stash to the current working directory, but keeps the stash in the stash list.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      stashId: z.string().optional().default("stash@{0}").describe("Stash reference to apply (defaults to most recent stash)")
    },
    async ({ path, stashId }) => {
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
        
        const result = await gitService.applyStash(stashId);
        
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
            text: `Successfully applied stash: ${stashId}`
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
  
  // Pop stash
  server.tool(
    "git_stash_pop",
    "Apply and remove a stash. Applies the specified stash to the working directory and then removes it from the stash stack. Combines the apply and drop operations.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      stashId: z.string().optional().default("stash@{0}").describe("Stash reference to pop (defaults to most recent stash)")
    },
    async ({ path, stashId }) => {
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
        
        const result = await gitService.popStash(stashId);
        
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
            text: `Successfully popped stash: ${stashId}`
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
  
  // Cherry-pick commits
  server.tool(
    "git_cherry_pick",
    "Apply changes from specific commits to the current branch. Takes the changes introduced in one or more existing commits and creates new commits with those changes on the current branch.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      commits: z.array(z.string()).min(1, "At least one commit hash is required").describe("Array of commit hashes to cherry-pick")
    },
    async ({ path, commits }) => {
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
        
        const result = await gitService.cherryPick(commits);
        
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
            text: `Successfully cherry-picked ${commits.length} commit${commits.length > 1 ? 's' : ''}`
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
  
  // Rebase
  server.tool(
    "git_rebase",
    "Reapply commits on top of another base commit. Takes all changes that were committed on one branch and replays them on another branch, providing a cleaner project history.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      branch: z.string().min(1, "Branch to rebase onto is required").describe("Branch or reference to rebase onto"),
      interactive: z.boolean().optional().default(false).describe("Whether to use interactive rebase mode")
    },
    async ({ path, branch, interactive }) => {
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
        
        const result = await gitService.rebase(branch, interactive);
        
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
            text: `Successfully rebased onto '${branch}'${interactive ? ' (interactive)' : ''}`
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
  
  // Log commits
  server.tool(
    "git_log",
    "Show commit history. Displays a log of commits in reverse chronological order, optionally limited to a specific file's history or a maximum number of commits.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      maxCount: z.number().positive().optional().default(50).describe("Maximum number of commits to display"),
      file: z.string().optional().describe("Optional file path to show history for a specific file")
    },
    async ({ path, maxCount, file }) => {
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
        
        const result = await gitService.getLog({
          maxCount,
          file
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
        
        if (result.resultData.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No commits found${file ? ` for file '${file}'` : ''}`
            }]
          };
        }
        
        // Format output
        let output = `Commit history${file ? ` for file '${file}'` : ''} (showing up to ${maxCount} commits)\n\n`;
        
        result.resultData.forEach(commit => {
          output += `Commit: ${commit.hash}\n`;
          output += `Author: ${commit.author} <${commit.authorEmail}>\n`;
          output += `Date: ${commit.date.toISOString()}\n\n`;
          output += `    ${commit.message}\n\n`;
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
  
  // Show commit details
  server.tool(
    "git_show",
    "Show details of a specific commit. Displays the commit message, author, date, and the changes introduced by the commit including the diff.",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      commitHash: z.string().min(1, "Commit hash is required").describe("Hash or reference of the commit to display")
    },
    async ({ path, commitHash }) => {
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
        
        const result = await gitService.showCommit(commitHash);
        
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
            text: result.resultData
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
