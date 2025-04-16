/**
 * Working Directory Tools
 * =====================
 * 
 * MCP tools for Git working directory operations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GitService } from '../services/git-service.js';
import { Schemas, PathValidation } from '../utils/validation.js';
import { getGlobalSettings } from '../utils/global-settings.js';
import { execSync } from 'child_process';

/**
 * Registers working directory tools with the MCP server
 * 
 * @param server - MCP server instance
 */
export function setupWorkdirTools(server: McpServer): void {
  // Set global working directory
  server.tool(
    "git_set_working_dir",
    "Set a global working directory path for all Git operations. Future tool calls can use '.' as the filepath and it will resolve to this global path. IMPORTANT: Always use a full, absolute path to ensure proper functionality.",
    {
      path: z.string().min(1, "Working directory path is required").describe("Full, absolute path to use as the global working directory"),
      validateGitRepo: z.boolean().optional().default(true).describe("Whether to validate that the path is a Git repository")
    },
    async ({ path, validateGitRepo }) => {
      try {
        const normalizedPath = PathValidation.normalizePath(path);
        
        // Check if this is a git repository if validation is requested
        if (validateGitRepo) {
          const gitService = new GitService(normalizedPath);
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
        }
        
        // Set the global working directory
        getGlobalSettings().setGlobalWorkingDir(normalizedPath);
        
        return {
          content: [{
            type: "text",
            text: `Successfully set global working directory to: ${normalizedPath}`
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

  // Clear global working directory
  server.tool(
    "git_clear_working_dir",
    "Clear the global working directory setting. Tools will use their explicitly provided path parameters.",
    {},
    async () => {
      try {
        const currentPath = getGlobalSettings().globalWorkingDir;
        getGlobalSettings().setGlobalWorkingDir(null);
        
        return {
          content: [{
            type: "text",
            text: currentPath 
              ? `Successfully cleared global working directory (was: ${currentPath})` 
              : "No global working directory was set"
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

  // Stage files
  server.tool(
    "git_add",
    "Stage files for commit. Adds file contents to the index (staging area) in preparation for the next commit. Can stage specific files or all changes in the working directory. IMPORTANT: Always use a full, absolute path to the repository to ensure proper functionality.",
    {
      path: z.string().min(1, "Repository path is required").describe("Full, absolute path to the Git repository"),
      files: z.union([
        z.string().min(1, "File path is required").describe("Path to a file to stage"), 
        z.array(z.string().min(1, "File path is required")).describe("Array of file paths to stage")
      ]).optional().default('.').describe("Files to stage for commit, defaults to all changes")
    },
    async ({ path, files }) => {
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
        
        const result = await gitService.stageFiles(files);
        
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
            text: `Successfully staged ${typeof files === 'string' && files === '.' ? 'all files' : 
              (Array.isArray(files) ? `${files.length} files` : `'${files}'`)}`
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
  
  // Unstage files
  server.tool(
    "git_reset",
    "Unstage files from the index. Removes file contents from the staging area while preserving the working directory changes. The opposite of git_add. IMPORTANT: Always use a full, absolute path to the repository to ensure proper functionality.",
    {
      path: z.string().min(1, "Repository path is required").describe("Full, absolute path to the Git repository"),
      files: z.union([
        z.string().min(1, "File path is required").describe("Path to a file to unstage"), 
        z.array(z.string().min(1, "File path is required")).describe("Array of file paths to unstage")
      ]).optional().default('.').describe("Files to unstage, defaults to all staged changes")
    },
    async ({ path, files }) => {
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
        
        const result = await gitService.unstageFiles(files);
        
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
            text: `Successfully unstaged ${typeof files === 'string' && files === '.' ? 'all files' : 
              (Array.isArray(files) ? `${files.length} files` : `'${files}'`)}`
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
  
  // Commit changes
  server.tool(
    "git_commit",
    "Commit staged changes to the repository. Creates a new commit containing the current contents of the index with the provided commit message. Supports optional author information, amending previous commits, and creating empty commits. IMPORTANT: Always use a full, absolute path to the repository to ensure proper functionality.",
    {
      path: z.string().min(1, "Repository path is required").describe("Full, absolute path to the Git repository"),
      message: z.string().min(1, "Commit message is required").describe("Message for the commit"),
      author: z.object({
        name: z.string().optional().describe("Author name for the commit"),
        email: z.string().email("Invalid email").optional().describe("Author email for the commit")
      }).optional().describe("Author information for the commit"),
      allowEmpty: z.boolean().optional().default(false).describe("Allow creating empty commits"),
      amend: z.boolean().optional().default(false).describe("Amend the previous commit instead of creating a new one")
    },
    async ({ path, message, author, allowEmpty, amend }) => {
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

        // Get global author information directly
        let finalAuthor = author;
        if (!author) {
          try {
            // Try to get global git config directly
            const globalUserName = execSync('git config --global user.name').toString().trim();
            const globalUserEmail = execSync('git config --global user.email').toString().trim();
            
            // Only set if we successfully got both values
            if (globalUserName && globalUserEmail) {
              finalAuthor = { name: globalUserName, email: globalUserEmail };
            }
          } catch (error) {
            console.error('Failed to get global git config for author', error);
          }
        }
        
        const result = await gitService.commit({
          message,
          author: finalAuthor,
          allowEmpty,
          amend
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
            text: `Successfully committed changes${amend ? ' (amended)' : ''} with message: "${message}"\nCommit hash: ${result.resultData}`
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
  
  // View working directory diff
  server.tool(
    "git_diff_unstaged",
    "Show unstaged changes in the working directory. Displays the differences between the working directory and the index (staging area). Can be limited to a specific file or show all changed files. IMPORTANT: Always use a full, absolute path to the repository to ensure proper functionality.",
    {
      path: z.string().min(1, "Repository path is required").describe("Full, absolute path to the Git repository"),
      file: z.string().optional().describe("Specific file to get diff for, or all files if omitted"),
      showUntracked: z.boolean().optional().default(true).describe("Whether to include information about untracked files")
    },
    async ({ path, file, showUntracked }) => {
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
        
        const result = await gitService.getUnstagedDiff(file, showUntracked);
        
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
              text: `No unstaged changes or untracked files${file ? ` in '${file}'` : ''}`
            }]
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
  
  // View staged diff
  server.tool(
    "git_diff_staged",
    "Show staged changes ready for commit. Displays the differences between the index (staging area) and the latest commit. Can be limited to a specific file or show all staged files. IMPORTANT: Always use a full, absolute path to the repository to ensure proper functionality.",
    {
      path: z.string().min(1, "Repository path is required").describe("Full, absolute path to the Git repository"),
      file: z.string().optional().describe("Specific file to get diff for, or all files if omitted")
    },
    async ({ path, file }) => {
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
        
        const result = await gitService.getStagedDiff(file);
        
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
              text: `No staged changes${file ? ` in '${file}'` : ''}`
            }]
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
  
  // Reset to a specific commit
  server.tool(
    "git_reset_commit",
    "Reset the current branch to a specific commit. This changes where the branch HEAD points to, with different modes affecting the working directory and index differently (hard: discard all changes, soft: keep staged changes, mixed: unstage but keep changes). IMPORTANT: Always use a full, absolute path to the repository to ensure proper functionality.",
    {
      path: z.string().min(1, "Repository path is required").describe("Full, absolute path to the Git repository"),
      ref: z.string().default("HEAD").describe("Reference to reset to, defaults to HEAD (e.g., commit hash, branch name, or HEAD~1)"),
      mode: z.enum(["hard", "soft", "mixed"]).default("mixed").describe("Reset mode: hard (discard changes), soft (keep staged), or mixed (unstage but keep changes)")
    },
    async ({ path, ref, mode }) => {
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
        
        const result = await gitService.reset(ref, mode);
        
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
            text: `Successfully reset to ${ref} using mode: ${mode}`
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
  
  // Clean working directory
  server.tool(
    "git_clean",
    "Remove untracked files from the working directory. Deletes files that aren't tracked by Git, optionally including directories. Use with caution as this operation cannot be undone. IMPORTANT: Always use a full, absolute path to the repository to ensure proper functionality.",
    {
      path: z.string().min(1, "Repository path is required").describe("Full, absolute path to the Git repository"),
      directories: z.boolean().optional().default(false).describe("Whether to remove untracked directories in addition to files"),
      force: z.boolean().optional().default(false).describe("Force cleaning of files, including ignored files")
    },
    async ({ path, directories, force }) => {
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
        
        const result = await gitService.clean(directories, force);
        
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
            text: `Successfully cleaned working directory${directories ? ' (including directories)' : ''}`
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
