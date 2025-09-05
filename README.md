<div align="center">

# @cyanheads/git-mcp-server

**Empower your AI agents with comprehensive, secure, and programmatic control over Git repositories!**

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Model Context Protocol SDK](https://img.shields.io/badge/MCP%20SDK-^1.17.1-green?style=flat-square)](https://github.com/modelcontextprotocol/typescript-sdk)
[![MCP Spec Version](https://img.shields.io/badge/MCP%20Spec-2025--06--18-lightgrey?style=flat-square)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/changelog.mdx)
[![Version](https://img.shields.io/badge/Version-2.3.1-blue?style=flat-square)](./CHANGELOG.md)
[![Coverage](https://img.shields.io/badge/Coverage-17.04%25-red?style=flat-square)](./vitest.config.ts)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green?style=flat-square)](https://github.com/cyanheads/git-mcp-server/issues)
[![GitHub](https://img.shields.io/github/stars/cyanheads/git-mcp-server?style=social)](https://github.com/cyanheads/git-mcp-server)

</div>

An MCP (Model Context Protocol) server providing a robust, LLM-friendly interface to the standard `git` command-line tool. Enables LLMs and AI agents to perform a wide range of Git operations like clone, commit, push, pull, branch, diff, log, status, and more via the MCP standard.

Built on the [`cyanheads/mcp-ts-template`](https://github.com/cyanheads/mcp-ts-template), this server follows a modular architecture with robust error handling, logging, and security features.

## 🤔 Why Use This Server?

- **Automate Git Workflows**: Enable AI agents to programmatically clone, commit, push, and manage branches.
- **Gain Repository Insights**: Allow tools to check status, view logs, and diff changes without direct shell access.
- **Integrate Git into AI-driven Development**: Let LLMs manage version control as part of their coding tasks.
- **Production-Ready Foundation**: Inherits logging, error handling, and security from the template.

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

##### Running the Server

- **Production (Stdio):**
  ```bash
  npm run start:stdio
  ```
- **Production (HTTP):**
  ```bash
  npm run start:http
  ```
- **Development (Stdio with watch mode):**
  ```bash
  npm run dev:stdio
  ```
- **Development (HTTP with watch mode):**
  ```bash
  npm run dev:http
  ```

### Installing with Docker

You can use the Dockerfile to create an image that hosts the mcp server. To build:

```sh
./scripts/build-docker.sh
```

Once complete, run the docker container. Refer to the example [docker-compose](./scripts/docker-compose.example.yaml) to create a docker compose file for your container. Once completed you can start the server with, for example, if you've put a file called `docker-compose.git-mcp.yaml` in your home directory;


```sh
docker compose -f ~/docker-compose.git-mcp.yaml up -d
```

#### Considerations when running with docker

Your local file system is made available to the server in Docker using a volume mount. This doesn't change the permissions; it appears inside the container
with the same uid/gid as your host machine.

##### Privileges to read/write files in the mount

The docker image MUST be built with the same uid/gid as your active user using the server. Otherwise, it may not be able to access the files on the mount. The build script should configure this correctly.

You need to add a volume that exposes the root of the git repos you plan to work with. The best strategy for this depends on the operating system

##### Linux/Mac/WSL

It's recommended that you configure the volume at the same path inside the container as the actual path on your computer. This way agents are likely to find your repositories easily since the path will be the same as from the host where it's making the request.

##### Windows

If you're using Windows, this won't work, since the paths may include drive letters or UNC paths.

  - Repos in the WSL filesystem work the same way as linux/mac
  - Repos in the windows filesystem will need to be accessed through the WSL mount, e.g. `/mnt/c` for the C drive. Since paths won't map the same way as the do in *nix type systems, I'd suggest making a volume called `/windows-code` or similar. Agents can be trained to map windows paths to this root when querying the server.


## ⚙️ Configuration

Configure the server using these environment variables (or a `.env` file):

| Variable              | Description                                                                                                                           | Default     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `MCP_TRANSPORT_TYPE`  | Transport mechanism: `stdio` or `http`.                                                                                               | `stdio`     |
| `MCP_HTTP_PORT`       | Port for the HTTP server (if `MCP_TRANSPORT_TYPE=http`). Retries next ports if busy.                                                  | `3015`      |
| `MCP_HTTP_HOST`       | Host address for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                                                      | `127.0.0.1` |
| `MCP_ALLOWED_ORIGINS` | Comma-separated list of allowed origins for CORS (if `MCP_TRANSPORT_TYPE=http`).                                                      | (none)      |
| `MCP_LOG_LEVEL`       | Logging level (`debug`, `info`, `notice`, `warning`, `error`, `crit`, `alert`, `emerg`). Inherited from template.                     | `info`      |
| `GIT_SIGN_COMMITS`    | Set to `"true"` to enable signing attempts for commits made by the `git_commit` tool. Requires server-side Git/key setup (see below). | `false`     |
| `MCP_AUTH_MODE`       | Authentication mode: `jwt`, `oauth`, or `none`.                                                                                       | `none`      |
| `MCP_AUTH_SECRET_KEY` | Secret key for JWT validation (if `MCP_AUTH_MODE=jwt`).                                                                               | `''`        |
| `OAUTH_ISSUER_URL`    | OIDC issuer URL for OAuth validation (if `MCP_AUTH_MODE=oauth`).                                                                      | `''`        |
| `OAUTH_AUDIENCE`      | Audience claim for OAuth validation (if `MCP_AUTH_MODE=oauth`).                                                                       | `''`        |

## 🏗️ Project Structure

- **`src/mcp-server/`**: Contains the core MCP server, tools, resources, and transport handlers.
- **`src/config/`**: Handles loading and validation of environment variables.
- **`src/types-global/`**: Defines shared TypeScript interfaces and type definitions.
- **`src/utils/`**: Core utilities (logging, error handling, security, etc.).
- **`src/index.ts`**: The main entry point that initializes and starts the server.

**Explore the full structure yourself:**

See the current file tree in [docs/tree.md](docs/tree.md) or generate it dynamically:

```bash
npm run tree
```

## 📦 Resources

In addition to tools, the server provides resources that offer contextual information about the Git environment.

| Resource URI              | Description                                                                                                    |
| :------------------------ | :------------------------------------------------------------------------------------------------------------- |
| `git://working-directory` | Returns the currently configured working directory for the session as a JSON object. Shows `NOT_SET` if unset. |

## Development

This project is set up with modern tooling to ensure code quality and a smooth development experience.

### Linting and Formatting

- **ESLint**: We use ESLint with the `typescript-eslint` plugin to enforce code quality and consistency. Run the linter with:
  ```bash
  npm run lint
  ```
  To automatically fix issues, run:
  ```bash
  npm run lint:fix
  ```
- **Prettier**: Code formatting is handled by Prettier. To format the entire codebase, run:
  ```bash
  npm run format
  ```

### Type Checking

You can run the TypeScript compiler to check for type errors without emitting any files:

```bash
npm run typecheck
```

### Testing

This server uses [Vitest](https://vitest.dev/) for testing.

- **Run all tests once:**
  ```bash
  npm test
  ```
- **Run tests in watch mode:**
  ```bash
  npm run test:watch
  ```
- **Run tests and generate a coverage report:**
  ```bash
  npm run test:coverage
  ```

### Generating Documentation

API documentation is generated from JSDoc comments using [TypeDoc](https://typedoc.org/). To generate the documentation, run:

```bash
npm run docs:generate
```

The output will be saved in the `docs/api` directory.

## 🧩 Extending the System

The canonical pattern for adding new tools is defined in the [.clinerules](.clinerules) file. It mandates a strict separation of concerns:

1.  **`logic.ts`**: Contains the pure business logic, Zod schemas, and type definitions. This file throws structured errors on failure.
2.  **`registration.ts`**: Acts as the "handler." It registers the tool with the server, wraps the logic call in a `try...catch` block, and formats the final success or error response.

This "Logic Throws, Handler Catches" pattern ensures that core logic remains pure and testable, while the registration layer handles all side effects and response formatting.

## 📜 License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
