[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/cyanheads-git-mcp-server-badge.png)](https://mseep.ai/app/cyanheads-git-mcp-server)

# Git MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP%20SDK-^1.15.1-green.svg)](https://modelcontextprotocol.io/)
[![Version](https://img.shields.io/badge/Version-2.2.0-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green.svg)](https://github.com/cyanheads/git-mcp-server/issues)
[![GitHub](https://img.shields.io/github/stars/cyanheads/git-mcp-server?style=social)](https://github.com/cyanheads/git-mcp-server)

**Empower your AI agents with comprehensive, secure, and programmatic control over Git repositories!**

An MCP (Model Context Protocol) server providing a robust, LLM-friendly interface to the standard `git` command-line tool. Enables LLMs and AI agents to perform a wide range of Git operations like clone, commit, push, pull, branch, diff, log, status, and more via the MCP standard.

Built on the [`cyanheads/mcp-ts-template`](https://github.com/cyanheads/mcp-ts-template), this server follows a modular architecture with robust error handling, logging, and security features.

## 🚀 Core Capabilities: Git Tools 🛠️

This server equips your AI with a comprehensive suite of tools to interact with Git repositories:

| Tool Category            | Description                                                       | Key Features -                                                                                                                                                                                                                                                                                                                                         |
| :----------------------- | :---------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repository & Staging** | Manage repository state, from initialization to staging changes.  | - `git_init`: Initialize a new repository.<br/>- `git_clone`: Clone remote repositories.<br/>- `git_add`: Stage changes for commit.<br/>- `git_status`: Check the status of the working directory.<br/>- `git_clean`: Remove untracked files (requires force flag). -                                                                                  |
| **Committing & History** | Create commits, inspect history, and view changes over time.      | - `git_commit`: Create new commits with conventional messages.<br/>- `git_log`: View commit history with filtering options.<br/>- `git_diff`: Show changes between commits, branches, or the working tree.<br/>- `git_show`: Inspect Git objects like commits and tags. -                                                                              |
| **Branching & Merging**  | Manage branches, merge changes, and rebase commits.               | - `git_branch`: List, create, delete, and rename branches.<br/>- `git_checkout`: Switch between branches or commits.<br/>- `git_merge`: Merge branches together.<br/>- `git_rebase`: Re-apply commits on top of another base.<br/>- `git_cherry_pick`: Apply specific commits from other branches. -                                                   |
| **Remote Operations**    | Interact with remote repositories.                                | - `git_remote`: Manage remote repository connections.<br/>- `git_fetch`: Download objects and refs from a remote.<br/>- `git_pull`: Fetch and integrate with another repository.<br/>- `git_push`: Update remote refs with local changes. -                                                                                                            |
| **Advanced Workflows**   | Support for more complex Git workflows and repository management. | - `git_tag`: Create, list, or delete tags.<br/>- `git_stash`: Temporarily store modified files.<br/>- `git_worktree`: Manage multiple working trees attached to a single repository.<br/>- `git_set_working_dir`: Set a persistent working directory for a session.<br/>- `git_wrapup_instructions`: Get a standard workflow for finalizing changes. - |

---

## Table of Contents

| [Overview](#overview) | [Features](#features) | [Installation](#installation) |
| [Configuration](#configuration) | [Project Structure](#project-structure) |
| [Tools](#tools) | [Resources](#resources) | [Development](#development) | [License](#license) |

## Overview

The Git MCP Server acts as a bridge, allowing applications (MCP Clients) that understand the Model Context Protocol (MCP) – like advanced AI coding assistants (LLMs), IDE extensions, or custom research tools – to interact directly and safely with local Git repositories.

Instead of complex scripting or manual command-line interaction, your tools can leverage this server to:

- **Automate Git workflows**: Clone repositories, create branches, stage changes, commit work, push updates, and manage tags programmatically.
- **Gain repository insights**: Check status, view logs, diff changes, and inspect Git objects without leaving the host application.
- **Integrate Git into AI-driven development**: Enable LLMs to manage version control as part of their coding or refactoring tasks, ensuring code integrity and history.
- **Support CI/CD and DevOps automation**: Build custom scripts and tools that orchestrate complex Git operations for automated builds, testing, and deployments.

Built on the robust `mcp-ts-template`, this server provides a standardized, secure, and efficient way to expose Git functionality via the MCP standard. It achieves this by securely executing the standard `git` command-line tool installed on the system using Node.js's `child_process` module, ensuring compatibility and leveraging the full power of Git.

> **Developer Note**: This repository includes a [.clinerules](.clinerules) file that serves as a developer cheat sheet for your LLM coding agent with quick reference for the codebase patterns, file locations, and code snippets.

## Features

### Core Utilities

Leverages the robust utilities provided by the `mcp-ts-template`:

- **Logging**: Structured, configurable logging (file rotation, stdout JSON, MCP notifications) with sensitive data redaction.
- **Error Handling**: Centralized error processing, standardized error types (`McpError`), and automatic logging.
- **Configuration**: Environment variable loading (`dotenv`) with comprehensive validation.
- **Input Validation/Sanitization**: Uses `zod` for schema validation and custom sanitization logic (crucial for paths).
- **Request Context**: Tracking and correlation of operations via unique request IDs using `AsyncLocalStorage`.
- **Type Safety**: Strong typing enforced by TypeScript and Zod schemas.
- **HTTP Transport**: High-performance HTTP server using **Hono**, featuring session management, CORS, and authentication support.
- **Deployment**: Multi-stage `Dockerfile` for creating small, secure production images with native dependency support.

### Git Integration

- **Direct Git CLI Execution**: Interacts with Git by securely executing the standard `git` command-line tool via Node.js `child_process`, ensuring full compatibility and access to Git's features.
- **Comprehensive Command Coverage**: Exposes a wide range of Git commands as MCP tools (see [Tools](#tools) section).
- **Repository Interaction**: Supports status checking, branching, staging, committing, fetching, pulling, pushing, diffing, logging, resetting, tagging, and more.
- **Working Directory Management**: Allows setting and clearing a session-specific working directory for context persistence across multiple Git operations.
- **Safety Features**: Includes checks and requires explicit confirmation for potentially destructive operations like `git clean` and `git reset --hard`.
- **Commit Signing**: Supports GPG or SSH signing for verified commits, controlled via the `GIT_SIGN_COMMITS` environment variable and server-side Git configuration. Includes an optional tool parameter to fall back to unsigned commits on signing failure.

## Installation

### Prerequisites

- [Node.js (>=20.0.0)](https://nodejs.org/)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [Git](https://git-scm.com/) installed and accessible in the system PATH.

### MCP Client Settings

Add the following to your MCP client's configuration file (e.g., `cline_mcp_settings.json`). This configuration uses `npx` to run the server, which will automatically install the package if not already present:

```json
{
  "mcpServers": {
    "git-mcp-server": {
      "command": "npx",
      "args": ["@cyanheads/git-mcp-server"],
      "env": {
        "MCP_LOG_LEVEL": "info",
        "GIT_SIGN_COMMITS": "false"
      }
    }
  }
}
```

### If running manually (not via MCP client) for development or testing

#### Install via npm

```bash
npm install @cyanheads/git-mcp-server
```

#### Alternatively Install from Source (recommended for development)

1. Clone the repository:

   ```bash
   git clone https://github.com/cyanheads/git-mcp-server.git
   cd git-mcp-server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   # or npm run rebuild
   ```

## Configuration

### Environment Variables

Configure the server using environment variables. These environmental variables are set within your MCP client config/settings (e.g. `claude_desktop_config.json` for Claude Desktop)

| Variable              | Description                                                                                                                           | Default     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `MCP_TRANSPORT_TYPE`  | Transport mechanism: `stdio` or `http`.                                                                                               | `stdio`     |
| `MCP_HTTP_PORT`       | Port for the HTTP server (if `MCP_TRANSPORT_TYPE=http`). Retries next ports if busy.                                                  | `3010`      |
| `MCP_HTTP_HOST`       | Host address for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                                                      | `127.0.0.1` |
| `MCP_ALLOWED_ORIGINS` | Comma-separated list of allowed origins for CORS (if `MCP_TRANSPORT_TYPE=http`).                                                      | (none)      |
| `MCP_LOG_LEVEL`       | Logging level (`debug`, `info`, `notice`, `warning`, `error`, `crit`, `alert`, `emerg`). Inherited from template.                     | `info`      |
| `GIT_SIGN_COMMITS`    | Set to `"true"` to enable signing attempts for commits made by the `git_commit` tool. Requires server-side Git/key setup (see below). | `false`     |
| `MCP_AUTH_MODE`       | Authentication mode: `jwt`, `oauth`, or `none`.                                                                                       | `none`      |
| `MCP_AUTH_SECRET_KEY` | Secret key for JWT validation (if `MCP_AUTH_MODE=jwt`).                                                                               | `''`        |
| `OAUTH_ISSUER_URL`    | OIDC issuer URL for OAuth validation (if `MCP_AUTH_MODE=oauth`).                                                                      | `''`        |
| `OAUTH_AUDIENCE`      | Audience claim for OAuth validation (if `MCP_AUTH_MODE=oauth`).                                                                       | `''`        |

## Project Structure

The codebase follows a modular structure within the `src/` directory:

```
src/
├── index.ts           # Entry point: Initializes and starts the server
├── config/            # Configuration loading (env vars, package info)
│   └── index.ts
├── mcp-server/        # Core MCP server logic and capability registration
│   ├── server.ts      # Server setup, capability registration
│   ├── transports/    # Transport handling (stdio, http)
│   ├── resources/     # MCP Resource implementations (currently none)
│   └── tools/         # MCP Tool implementations (subdirs per tool)
├── types-global/      # Shared TypeScript type definitions
└── utils/             # Common utility functions (logger, error handler, etc.)
```

For a detailed file tree, run `npm run tree` or see [docs/tree.md](docs/tree.md).

## Tools

The Git MCP Server provides a suite of tools for interacting with Git repositories, callable via the Model Context Protocol.

| Tool Name                 | Description                                                                                                | Key Arguments                                                                                                                   |
| :------------------------ | :--------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| `git_add`                 | Stages specified files or patterns.                                                                        | `path?`, `files?`                                                                                                               |
| `git_branch`              | Manages branches (list, create, delete, rename, show current).                                             | `path?`, `mode`, `branchName?`, `newBranchName?`, `startPoint?`, `force?`, `all?`, `remote?`                                    |
| `git_checkout`            | Switches branches or restores working tree files.                                                          | `path?`, `branchOrPath`, `newBranch?`, `force?`                                                                                 |
| `git_cherry_pick`         | Applies changes introduced by existing commits.                                                            | `path?`, `commitRef`, `mainline?`, `strategy?`, `noCommit?`, `signoff?`                                                         |
| `git_clean`               | Removes untracked files. **Requires `force: true`**.                                                       | `path?`, `force`, `dryRun?`, `directories?`, `ignored?`                                                                         |
| `git_clear_working_dir`   | Clears the session-specific working directory.                                                             | (none)                                                                                                                          |
| `git_clone`               | Clones a repository into a specified absolute path.                                                        | `repositoryUrl`, `targetPath`, `branch?`, `depth?`, `quiet?`                                                                    |
| `git_commit`              | Commits staged changes. Supports author override, signing control.                                         | `path?`, `message`, `author?`, `allowEmpty?`, `amend?`, `forceUnsignedOnFailure?`                                               |
| `git_diff`                | Shows changes between commits, working tree, etc.                                                          | `path?`, `commit1?`, `commit2?`, `staged?`, `file?`, `includeUntracked?`                                                        |
| `git_fetch`               | Downloads objects and refs from other repositories.                                                        | `path?`, `remote?`, `prune?`, `tags?`, `all?`                                                                                   |
| `git_init`                | Initializes a new Git repository at the specified absolute path. Defaults to 'main' for initial branch.    | `path`, `initialBranch?`, `bare?`, `quiet?`                                                                                     |
| `git_log`                 | Shows commit logs.                                                                                         | `path?`, `maxCount?`, `author?`, `since?`, `until?`, `branchOrFile?`                                                            |
| `git_merge`               | Merges the specified branch into the current branch.                                                       | `path?`, `branch`, `commitMessage?`, `noFf?`, `squash?`, `abort?`                                                               |
| `git_pull`                | Fetches from and integrates with another repository or local branch.                                       | `path?`, `remote?`, `branch?`, `rebase?`, `ffOnly?`                                                                             |
| `git_push`                | Updates remote refs using local refs.                                                                      | `path?`, `remote?`, `branch?`, `remoteBranch?`, `force?`, `forceWithLease?`, `setUpstream?`, `tags?`, `delete?`                 |
| `git_rebase`              | Reapplies commits on top of another base tip.                                                              | `path?`, `mode?`, `upstream?`, `branch?`, `interactive?`, `strategy?`, `strategyOption?`, `onto?`                               |
| `git_remote`              | Manages remote repositories (list, add, remove, show).                                                     | `path?`, `mode`, `name?`, `url?`                                                                                                |
| `git_reset`               | Resets current HEAD to a specified state. Supports soft, mixed, hard modes. **USE 'hard' WITH CAUTION**.   | `path?`, `mode?`, `commit?`                                                                                                     |
| `git_set_working_dir`     | Sets the default working directory. Can optionally initialize repo if not present. Requires absolute path. | `path`, `validateGitRepo?`, `initializeIfNotPresent?`                                                                           |
| `git_show`                | Shows information about Git objects (commits, tags, etc.).                                                 | `path?`, `ref`, `filePath?`                                                                                                     |
| `git_stash`               | Manages stashed changes (list, apply, pop, drop, save).                                                    | `path?`, `mode`, `stashRef?`, `message?`                                                                                        |
| `git_status`              | Gets repository status (branch, staged, modified, untracked files).                                        | `path?`                                                                                                                         |
| `git_tag`                 | Manages tags (list, create annotated/lightweight, delete).                                                 | `path?`, `mode`, `tagName?`, `message?`, `commitRef?`, `annotate?`                                                              |
| `git_worktree`            | Manages Git worktrees (list, add, remove, move, prune).                                                    | `path?`, `mode`, `worktreePath?`, `commitish?`, `newBranch?`, `force?`, `detach?`, `newPath?`, `verbose?`, `dryRun?`, `expire?` |
| `git_wrapup_instructions` | Provides a standard Git wrap-up workflow.                                                                  | `acknowledgement`, `updateAgentMetaFiles?`                                                                                      |

_Note: The `path` parameter for most tools defaults to the session's working directory if set via `git_set_working_dir`._

## Resources

**MCP Resources are not implemented in this version (v2.2.0).**

This version focuses on the refactored Git tools implementation based on the latest `mcp-ts-template` and MCP SDK v1.15.1. Resource capabilities, previously available, have been temporarily removed during this major update.

If you require MCP Resource access (e.g., for reading file content directly via the server), please use the stable **[v1.2.4 release](https://github.com/cyanheads/git-mcp-server/releases/tag/v1.2.4)**.

Future development may reintroduce resource capabilities in a subsequent release.

## Development

### Build and Test

```bash
# Build the project (compile TS to JS in dist/ and make executable)
npm run build

# Test the server locally using the MCP inspector tool (stdio transport)
npm run inspector

# Test the server locally using the MCP inspector tool (http transport)
npm run inspector:http

# Clean build artifacts
npm run clean

# Generate a file tree representation for documentation
npm run tree

# Clean build artifacts and then rebuild the project
npm run rebuild

# Format code with Prettier
npm run format

# Start the server using stdio (default)
npm start
# Or explicitly:
npm run start:stdio

# Start the server using HTTP transport
npm run start:http
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
Built with the <a href="https://modelcontextprotocol.io/">Model Context Protocol</a>
</div>
