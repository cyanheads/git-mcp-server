<div align="center">
  <h1>@cyanheads/git-mcp-server</h1>
  <p><b>A secure and scalable Git MCP server giving AI agents powerful version control for local and (soon) serverless environments. STDIO & Streamable HTTP</b>
  <div>27 Tools • 1 Resource • 1 Prompt</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-2.6.2-blue.svg?style=flat-square)](./CHANGELOG.md) [![MCP Spec](https://img.shields.io/badge/MCP%20Spec-2025--11--25-8A2BE2.svg?style=flat-square)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/changelog.mdx) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^1.24.3-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Status](https://img.shields.io/badge/Status-Stable-brightgreen.svg?style=flat-square)](https://github.com/cyanheads/git-mcp-server/issues) [![TypeScript](https://img.shields.io/badge/TypeScript-^5.9.3-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.2.21-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

---

## 🛠️ Tools Overview

This server provides 27 comprehensive Git operations organized into six functional categories:

| Category                  | Tools                                                                                                                          | Description                                                                                                           |
| :------------------------ | :----------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| **Repository Management** | `git_init`, `git_clone`, `git_status`, `git_clean`                                                                             | Initialize repos, clone from remotes, check status, and clean untracked files                                         |
| **Staging & Commits**     | `git_add`, `git_commit`, `git_diff`                                                                                            | Stage changes, create commits, and compare changes                                                                    |
| **History & Inspection**  | `git_log`, `git_show`, `git_blame`, `git_reflog`                                                                               | View commit history, inspect objects, trace line-by-line authorship, and view ref logs                                |
| **Branching & Merging**   | `git_branch`, `git_checkout`, `git_merge`, `git_rebase`, `git_cherry_pick`                                                     | Manage branches, switch contexts, integrate changes, and apply specific commits                                       |
| **Remote Operations**     | `git_remote`, `git_fetch`, `git_pull`, `git_push`                                                                              | Configure remotes, download updates, synchronize repositories, and publish changes                                    |
| **Advanced Workflows**    | `git_tag`, `git_stash`, `git_reset`, `git_worktree`, `git_set_working_dir`, `git_clear_working_dir`, `git_wrapup_instructions` | Tag releases, stash changes, reset state, manage worktrees, set/clear session directory, and access workflow guidance |

## 📦 Resources Overview

The server provides resources that offer contextual information about the Git environment:

| Resource                  | URI                       | Description                                                                                                                                     |
| :------------------------ | :------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Git Working Directory** | `git://working-directory` | Provides the current session working directory for git operations. This is the directory set via `git_set_working_dir` and used as the default. |

## 🎯 Prompts Overview

The server provides structured prompt templates that guide AI agents through complex workflows:

| Prompt          | Description                                                                                                                                | Parameters                                                                 |
| :-------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Git Wrap-up** | A systematic workflow protocol for completing git sessions. Guides agents through reviewing, documenting, committing, and tagging changes. | `changelogPath`, `skipDocumentation`, `createTag`, and `updateAgentFiles`. |

## 🚀 Getting Started

### Runtime Compatibility

This server works with **both Bun and Node.js runtimes**:

| Runtime     | Command                                 | Minimum Version | Notes                      |
| ----------- | --------------------------------------- | --------------- | -------------------------- |
| **Node.js** | `npx @cyanheads/git-mcp-server@latest`  | ≥ 20.0.0        | Universal compatibility    |
| **Bun**     | `bunx @cyanheads/git-mcp-server@latest` | ≥ 1.2.0         | Alternative runtime option |

The server automatically detects the runtime and uses the appropriate process spawning method for git operations.

### MCP Client Settings/Configuration

Add the following to your MCP Client configuration file (e.g., `cline_mcp_settings.json`). Clients have different ways to configure servers, so refer to your client's documentation for specifics.

**Be sure to update environment variables as needed (especially your Git information!)**

#### Using npx (Node.js)

```json
{
  "mcpServers": {
    "git-mcp-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["@cyanheads/git-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "MCP_LOG_LEVEL": "info",
        "GIT_BASE_DIR": "~/Developer/",
        "LOGS_DIR": "~/Developer/logs/git-mcp-server/",
        "GIT_USERNAME": "cyanheads",
        "GIT_EMAIL": "casey@caseyjhand.com",
        "GIT_SIGN_COMMITS": "false"
      }
    }
  }
}
```

#### Using bunx (Bun)

```json
{
  "mcpServers": {
    "git-mcp-server": {
      "type": "stdio",
      "command": "bunx",
      "args": ["@cyanheads/git-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "MCP_LOG_LEVEL": "info",
        "GIT_BASE_DIR": "~/Developer/",
        "LOGS_DIR": "~/Developer/logs/git-mcp-server/",
        "GIT_USERNAME": "cyanheads",
        "GIT_EMAIL": "casey@caseyjhand.com",
        "GIT_SIGN_COMMITS": "false"
      }
    }
  }
}
```

#### Streamable HTTP Configuration

```bash
MCP_TRANSPORT_TYPE=http
MCP_HTTP_PORT=3015
```

## ✨ Server Features

This server is built on the [`mcp-ts-template`](https://github.com/cyanheads/mcp-ts-template) and inherits its rich feature set:

- **Declarative Tools**: Define agent capabilities in single, self-contained files. The framework handles registration, validation, and execution.
- **Robust Error Handling**: A unified `McpError` system ensures consistent, structured error responses.
- **Pluggable Authentication**: Secure your server with zero-fuss support for `none`, `jwt`, or `oauth` modes.
- **Abstracted Storage**: Swap storage backends (`in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2`) without changing business logic.
- **Full-Stack Observability**: Deep insights with structured logging (Pino) and optional, auto-instrumented OpenTelemetry for traces and metrics.
- **Dependency Injection**: Built with `tsyringe` for a clean, decoupled, and testable architecture.
- **Edge-Ready Architecture**: Built on an edge-compatible framework that runs seamlessly on local machines or Cloudflare Workers. _Note: Current git operations use the CLI provider which requires local git installation. Edge deployment support is planned through the isomorphic-git provider integration._

Plus, specialized features for **Git integration**:

- **Cross-Runtime Compatibility**: Works seamlessly with both Bun and Node.js runtimes. Automatically detects the runtime and uses optimal process spawning (Bun.spawn in Bun, child_process.spawn in Node.js).
- **Provider-Based Architecture**: Pluggable git provider system with current CLI implementation and planned isomorphic-git provider for edge deployment.
- **Optimized Git Execution**: Direct git CLI interaction with cross-runtime support for high-performance process management, streaming I/O, and timeout handling (current CLI provider).
- **Comprehensive Coverage**: 27 tools covering all essential Git operations from init to push.
- **Working Directory Management**: Session-specific directory context for multi-repo workflows.
- **Configurable Git Identity**: Override author/committer information via environment variables with automatic fallback to global git config.
- **Safety Features**: Explicit confirmations for destructive operations like `git clean` and `git reset --hard`.
- **Commit Signing**: Optional GPG/SSH signing support for all commit-creating operations (commits, merges, rebases, cherry-picks, and tags).

### Development Environment Setup

### Prerequisites

- [Node.js v20.0.0+](https://nodejs.org/) (or [Bun v1.2.0+](https://bun.sh/) as an alternative)
- [Git](https://git-scm.com/) installed and accessible in your system PATH

### Installation

1. **Clone the repository:**

```sh
git clone https://github.com/cyanheads/git-mcp-server.git
```

2. **Navigate into the directory:**

```sh
cd git-mcp-server
```

3. **Install dependencies:**

```sh
npm install
```

## ⚙️ Configuration

All configuration is centralized and validated at startup in `src/config/index.ts`. Key environment variables in your `.env` file include:

| Variable                       | Description                                                                                                                                               | Default     |
| :----------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| `MCP_TRANSPORT_TYPE`           | The transport to use: `stdio` or `http`.                                                                                                                  | `stdio`     |
| `MCP_SESSION_MODE`             | Session mode for HTTP transport: `stateless`, `stateful`, or `auto`.                                                                                      | `auto`      |
| `MCP_RESPONSE_FORMAT`          | Response format: `json` (LLM-optimized), `markdown` (human-readable), or `auto`.                                                                          | `json`      |
| `MCP_RESPONSE_VERBOSITY`       | Response detail level: `minimal`, `standard`, or `full`.                                                                                                  | `standard`  |
| `MCP_HTTP_PORT`                | The port for the HTTP server.                                                                                                                             | `3015`      |
| `MCP_HTTP_HOST`                | The hostname for the HTTP server.                                                                                                                         | `127.0.0.1` |
| `MCP_HTTP_ENDPOINT_PATH`       | The endpoint path for MCP requests.                                                                                                                       | `/mcp`      |
| `MCP_AUTH_MODE`                | Authentication mode: `none`, `jwt`, or `oauth`.                                                                                                           | `none`      |
| `STORAGE_PROVIDER_TYPE`        | Storage backend: `in-memory`, `filesystem`, `supabase`, `cloudflare-kv`, `r2`.                                                                            | `in-memory` |
| `OTEL_ENABLED`                 | Set to `true` to enable OpenTelemetry.                                                                                                                    | `false`     |
| `MCP_LOG_LEVEL`                | The minimum level for logging (`debug`, `info`, `warn`, `error`).                                                                                         | `info`      |
| `GIT_SIGN_COMMITS`             | Set to `"true"` to enable GPG/SSH signing for all commits, merges, rebases, cherry-picks, and tags. Requires GPG/SSH configuration.                       | `false`     |
| `GIT_AUTHOR_NAME`              | Git author name. Aliases: `GIT_USERNAME`, `GIT_USER`. Falls back to global git config if not set.                                                         | `(none)`    |
| `GIT_AUTHOR_EMAIL`             | Git author email. Aliases: `GIT_EMAIL`, `GIT_USER_EMAIL`. Falls back to global git config if not set.                                                     | `(none)`    |
| `GIT_BASE_DIR`                 | Optional absolute path to restrict all git operations to a specific directory tree. Provides security sandboxing for multi-tenant or shared environments. | `(none)`    |
| `GIT_WRAPUP_INSTRUCTIONS_PATH` | Optional path to custom markdown file with Git workflow instructions.                                                                                     | `(none)`    |
| `MCP_AUTH_SECRET_KEY`          | **Required for `jwt` auth.** A 32+ character secret key.                                                                                                  | `(none)`    |
| `OAUTH_ISSUER_URL`             | **Required for `oauth` auth.** URL of the OIDC provider.                                                                                                  | `(none)`    |

## ▶️ Running the Server

### For End Users (via Package Manager)

The easiest way to use the server is via `npx` (no installation required):

```sh
npx @cyanheads/git-mcp-server@latest
```

Configured through environment variables or your MCP client configuration. Bun users can alternatively use `bunx @cyanheads/git-mcp-server@latest`.

### Local Development

- **Build and run the production version**:

  ```sh
  # One-time build
  npm run rebuild

  # Run the built server
  npm run start:http
  # or
  npm run start:stdio
  ```

- **Development mode with hot reload**:

  ```sh
  npm run dev:http
  # or
  npm run dev:stdio
  ```

- **Run checks and tests**:
  ```sh
  npm run devcheck  # Lints, formats, type-checks, and more
  npm test          # Runs the test suite
  ```

### Cloudflare Workers

1. **Build the Worker bundle**:

```sh
npm run build:worker
```

2. **Run locally with Wrangler**:

```sh
npm run deploy:dev
```

3. **Deploy to Cloudflare**:

```sh
npm run deploy:prod
```

## 📂 Project Structure

| Directory                   | Purpose & Contents                                                               |
| :-------------------------- | :------------------------------------------------------------------------------- |
| `src/mcp-server/tools`      | Your tool definitions (`*.tool.ts`). This is where Git capabilities are defined. |
| `src/mcp-server/resources`  | Your resource definitions (`*.resource.ts`). Provides Git context data sources.  |
| `src/mcp-server/transports` | Implementations for HTTP and STDIO transports, including auth middleware.        |
| `src/storage`               | `StorageService` abstraction and all storage provider implementations.           |
| `src/services`              | Integrations with external services (LLMs, Speech, etc.).                        |
| `src/container`             | Dependency injection container registrations and tokens.                         |
| `src/utils`                 | Core utilities for logging, error handling, performance, and security.           |
| `src/config`                | Environment variable parsing and validation with Zod.                            |
| `tests/`                    | Unit and integration tests, mirroring the `src/` directory structure.            |

## 📤 Understanding Tool Responses

This server follows MCP's dual-output architecture for all tools ([MCP Tools Specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)):

### Response Format Options

Configure response format and verbosity via environment variables (see [Configuration](#️-configuration)):

| Variable                 | Values                                  | Description                                                               |
| :----------------------- | :-------------------------------------- | :------------------------------------------------------------------------ |
| `MCP_RESPONSE_FORMAT`    | `json` (default), `markdown`, `auto`    | Output format: JSON for LLM parsing, Markdown for human UIs               |
| `MCP_RESPONSE_VERBOSITY` | `minimal`, `standard` (default), `full` | Detail level: minimal (core only), standard (balanced), full (everything) |

### What Users See (Human-Readable)

When you invoke a tool through your MCP client, you see a **formatted summary** designed for human consumption. For example, `git_status` might show:

**Markdown Format:**

```
# Git Status: main

## Staged (2)
- src/index.ts
- README.md

## Unstaged (1)
- package.json
```

**JSON Format (LLM-Optimized):**

```json
{
  "success": true,
  "branch": "main",
  "staged": ["src/index.ts", "README.md"],
  "unstaged": ["package.json"],
  "untracked": []
}
```

### What the LLM Sees (Complete Structured Data)

Behind the scenes, the LLM receives **complete structured data** as [content blocks](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#tool-results) via the `responseFormatter` function. This includes:

- All metadata (commit hashes, timestamps, authors)
- Full file lists and change details (never truncated - LLMs need complete context)
- Structured JSON or formatted markdown based on configuration
- Everything needed to answer follow-up questions

**Why This Matters**: The LLM can answer detailed questions like "Who made the last commit?" or "What files changed in commit abc123?" because it has access to the full dataset, even if you only saw a summary.

**Verbosity Levels**: Control the amount of detail returned:

- **Minimal**: Core data only (success status, primary identifiers)
- **Standard**: Balanced output with essential context (recommended)
- **Full**: Complete data including all metadata and statistics

**For Developers**: When creating custom tools, always include complete data in your `responseFormatter`. Balance human-readable summaries with comprehensive structured information. See [`AGENTS.md`](AGENTS.md) for response formatter best practices and the [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) for technical details.

## 🧑‍💻 Agent Development Guide

For strict rules when using this server with an AI agent, refer to the **`AGENTS.md`** file in this repository. Key principles include:

- **Logic Throws, Handlers Catch**: Never use `try/catch` in your tool `logic`. Throw an `McpError` instead.
- **Pass the Context**: Always pass the `RequestContext` object through your call stack for logging and tracing.
- **Use the Barrel Exports**: Register new tools and resources only in the `index.ts` barrel files within their respective `definitions` directories.
- **Declarative Tool Pattern**: Each tool is defined in a single `*.tool.ts` file with schema, logic, and response formatting.

## 🔒 Security Features

- **Path Sanitization**: All file paths are validated and sanitized to prevent directory traversal attacks.
- **Base Directory Restriction**: Optional `GIT_BASE_DIR` configuration to restrict all git operations to a specific directory tree, providing security sandboxing for multi-tenant or shared hosting environments.
- **Command Injection Prevention**: Git commands are executed with carefully validated arguments via Bun.spawn.
- **Destructive Operation Protection**: Dangerous operations require explicit confirmation flags.
- **Authentication Support**: Built-in JWT and OAuth support for secure deployments.
- **Rate Limiting**: Optional rate limiting via the DI-managed `RateLimiter` service.
- **Audit Logging**: All Git operations are logged with full context for security auditing.

## 🧪 Testing

This server uses [Vitest](https://vitest.dev/) for testing.

- **Run all tests:**

  ```sh
  npm test
  ```

- **Run tests with coverage:**

  ```sh
  npm run test:coverage
  ```

- **Run tests in watch mode:**
  ```sh
  npm test -- --watch
  ```

## 🗺️ Roadmap

### Planned Git Provider Integrations

The server uses a **provider-based architecture** to support multiple git implementation backends:

- **✅ CLI Provider** (Current): Full-featured git operations via native git CLI
  - Complete coverage of all 27 git tools
  - Executes git commands using Bun.spawn for optimal performance
  - Streaming I/O handling for large outputs (10MB buffer limit)
  - Configurable timeouts (60s default) and automatic process cleanup
  - Requires local git installation
  - Best for local development and server deployments

- **🚧 Isomorphic Git Provider** (Planned): Pure JavaScript git implementation
  - Edge deployment compatibility (Cloudflare Workers, Vercel Edge, Deno Deploy)
  - No system dependencies required
  - Enables true serverless git operations
  - Core operations: clone, status, add, commit, push, pull, branch, checkout
  - Implementation: [isomorphic-git](https://isomorphic-git.org/)

- **💡 GitHub API Provider** (Maybe): Cloud-native git operations via GitHub REST/GraphQL APIs
  - No local repository required
  - Direct integration with GitHub-hosted repositories
  - Ideal for GitHub-centric workflows

The provider system allows seamless switching between implementations based on deployment environment and requirements. See [`AGENTS.md`](AGENTS.md#git-service-architecture-git-mcp-server-specific) for architectural details.

## 🤝 Contributing

Issues and pull requests are welcome! If you plan to contribute, please run the local checks and tests before submitting your PR.

```sh
npm run devcheck
npm test
```

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the existing patterns
4. Run `npm run devcheck` to ensure code quality
5. Run `npm test` to verify all tests pass
6. Commit your changes with conventional commits
7. Push to your fork and open a Pull Request

## 📜 License

This project is licensed under the Apache 2.0 License. See the [LICENSE](./LICENSE) file for details.

---

<div align="center">
  <p>Built with ❤️ using the <a href="https://github.com/cyanheads/mcp-ts-template">mcp-ts-template</a></p>
  <p>
    <a href="https://github.com/sponsors/cyanheads">Sponsor this project</a> •
    <a href="https://www.buymeacoffee.com/cyanheads">Buy me a coffee</a>
  </p>
</div>
