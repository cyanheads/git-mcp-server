<div align="center">
  <h1>@cyanheads/git-mcp-server</h1>
  <p><b>A Git MCP server for AI agents. STDIO & Streamable HTTP.</b>
  <div>28 Tools · 1 Resource · 1 Prompt</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-2.10.2-blue.svg?style=flat-square)](./CHANGELOG.md) [![MCP Spec](https://img.shields.io/badge/MCP%20Spec-2025--11--25-8A2BE2.svg?style=flat-square)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/changelog.mdx) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^1.27.1-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Status](https://img.shields.io/badge/Status-Stable-brightgreen.svg?style=flat-square)](https://github.com/cyanheads/git-mcp-server/issues) [![TypeScript](https://img.shields.io/badge/TypeScript-^5.9.3-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.2.21-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

---

## Tools

28 git operations organized into seven categories:

| Category                  | Tools                                                                                                                          | Description                                                                             |
| :------------------------ | :----------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **Repository Management** | `git_init`, `git_clone`, `git_status`, `git_clean`                                                                             | Initialize repos, clone from remotes, check status, clean untracked files               |
| **Staging & Commits**     | `git_add`, `git_commit`, `git_diff`                                                                                            | Stage changes, create commits, compare changes                                          |
| **History & Inspection**  | `git_log`, `git_show`, `git_blame`, `git_reflog`                                                                               | View commit history, inspect objects, trace authorship, view ref logs                   |
| **Analysis**              | `git_changelog_analyze`                                                                                                        | Gather git context and instructions for LLM-driven changelog analysis                   |
| **Branching & Merging**   | `git_branch`, `git_checkout`, `git_merge`, `git_rebase`, `git_cherry_pick`                                                     | Manage branches, switch contexts, integrate changes, apply specific commits             |
| **Remote Operations**     | `git_remote`, `git_fetch`, `git_pull`, `git_push`                                                                              | Configure remotes, fetch updates, synchronize repositories, publish changes             |
| **Advanced Workflows**    | `git_tag`, `git_stash`, `git_reset`, `git_worktree`, `git_set_working_dir`, `git_clear_working_dir`, `git_wrapup_instructions` | Tag releases, stash changes, reset state, manage worktrees, set/clear session directory |

## Resources

| Resource                  | URI                       | Description                                                           |
| :------------------------ | :------------------------ | :-------------------------------------------------------------------- |
| **Git Working Directory** | `git://working-directory` | The current session working directory, set via `git_set_working_dir`. |

## Prompts

| Prompt          | Description                                                                               | Parameters                                                             |
| :-------------- | :---------------------------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| **Git Wrap-up** | Workflow protocol for completing git sessions: review, document, commit, and tag changes. | `changelogPath`, `skipDocumentation`, `createTag`, `updateAgentFiles`. |

## Getting started

### Runtime

Works with both Bun and Node.js. Runtime is auto-detected.

| Runtime     | Command                                 | Minimum Version |
| ----------- | --------------------------------------- | --------------- |
| **Node.js** | `npx @cyanheads/git-mcp-server@latest`  | >= 20.0.0       |
| **Bun**     | `bunx @cyanheads/git-mcp-server@latest` | >= 1.2.0        |

### MCP client configuration

Add the following to your MCP client config (e.g., `cline_mcp_settings.json`). Update the environment variables to match your setup — especially the git identity fields.

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
        "GIT_SIGN_COMMITS": "true"
      }
    }
  }
}
```

Bun users: replace `"command": "npx"` with `"command": "bunx"`.

For Streamable HTTP, set `MCP_TRANSPORT_TYPE=http` and `MCP_HTTP_PORT=3015`.

## Features

Built on [`mcp-ts-template`](https://github.com/cyanheads/mcp-ts-template).

| Feature                      | Details                                                                                                             |
| :--------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| Declarative tools            | Define capabilities in single, self-contained files. The framework handles registration, validation, and execution. |
| Error handling               | Unified `McpError` system for consistent, structured error responses.                                               |
| Authentication               | Supports `none`, `jwt`, and `oauth` modes.                                                                          |
| Pluggable storage            | Swap backends (`in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2`) without changing business logic.          |
| Observability                | Structured logging (Pino) and optional auto-instrumented OpenTelemetry for traces and metrics.                      |
| Dependency injection         | Built with `tsyringe` for decoupled, testable architecture.                                                         |
| Cross-runtime                | Auto-detects Bun or Node.js and uses the appropriate process spawning method.                                       |
| Provider architecture        | Pluggable git provider system. Current: CLI. Planned: isomorphic-git for edge deployment.                           |
| Working directory management | Session-specific directory context for multi-repo workflows.                                                        |
| Configurable git identity    | Override author/committer info via environment variables, with fallback to global git config.                       |
| Commit signing               | Optional GPG/SSH signing for commits, merges, rebases, cherry-picks, and tags.                                      |
| Safety                       | Destructive operations (`git clean`, `git reset --hard`) require explicit confirmation flags.                       |

## Security

- All file paths are validated and sanitized to prevent directory traversal.
- Optional `GIT_BASE_DIR` restricts operations to a specific directory tree for multi-tenant sandboxing.
- Git commands use validated arguments via process spawning — no shell interpolation.
- JWT and OAuth support for authenticated deployments.
- Optional rate limiting via the DI-managed `RateLimiter` service.
- All operations are logged with request context for auditing.

## Configuration

All configuration is validated at startup in `src/config/index.ts`. Key environment variables:

| Variable                       | Description                                                                                | Default     |
| :----------------------------- | :----------------------------------------------------------------------------------------- | :---------- |
| `MCP_TRANSPORT_TYPE`           | Transport: `stdio` or `http`.                                                              | `stdio`     |
| `MCP_SESSION_MODE`             | HTTP session mode: `stateless`, `stateful`, or `auto`.                                     | `auto`      |
| `MCP_RESPONSE_FORMAT`          | Response format: `json` (LLM-optimized), `markdown` (human-readable), or `auto`.           | `json`      |
| `MCP_RESPONSE_VERBOSITY`       | Detail level: `minimal`, `standard`, or `full`.                                            | `standard`  |
| `MCP_HTTP_PORT`                | HTTP server port.                                                                          | `3015`      |
| `MCP_HTTP_HOST`                | HTTP server hostname.                                                                      | `127.0.0.1` |
| `MCP_HTTP_ENDPOINT_PATH`       | MCP request endpoint path.                                                                 | `/mcp`      |
| `MCP_AUTH_MODE`                | Authentication mode: `none`, `jwt`, or `oauth`.                                            | `none`      |
| `STORAGE_PROVIDER_TYPE`        | Storage backend: `in-memory`, `filesystem`, `supabase`, `cloudflare-kv`, `r2`.             | `in-memory` |
| `OTEL_ENABLED`                 | Enable OpenTelemetry.                                                                      | `false`     |
| `MCP_LOG_LEVEL`                | Minimum log level: `debug`, `info`, `warn`, `error`.                                       | `info`      |
| `GIT_SIGN_COMMITS`             | Enable GPG/SSH signing for commits, merges, rebases, cherry-picks, and tags.               | `false`     |
| `GIT_AUTHOR_NAME`              | Git author name. Aliases: `GIT_USERNAME`, `GIT_USER`. Falls back to global git config.     | `(none)`    |
| `GIT_AUTHOR_EMAIL`             | Git author email. Aliases: `GIT_EMAIL`, `GIT_USER_EMAIL`. Falls back to global git config. | `(none)`    |
| `GIT_BASE_DIR`                 | Absolute path to restrict all git operations to a specific directory tree.                 | `(none)`    |
| `GIT_WRAPUP_INSTRUCTIONS_PATH` | Path to custom markdown file with workflow instructions.                                   | `(none)`    |
| `MCP_AUTH_SECRET_KEY`          | Required for `jwt` auth. 32+ character secret key.                                         | `(none)`    |
| `OAUTH_ISSUER_URL`             | Required for `oauth` auth. OIDC provider URL.                                              | `(none)`    |

## Running the server

### Via package manager (no install)

```sh
npx @cyanheads/git-mcp-server@latest
```

Configure through environment variables or your MCP client config.

### Local development

```sh
# Build and run
npm run rebuild
npm run start:stdio   # or start:http

# Dev mode with hot reload
npm run dev:stdio     # or dev:http

# Checks and tests
npm run devcheck      # lint, format, typecheck
npm test
```

### Cloudflare Workers

```sh
npm run build:worker   # Build the worker bundle
npm run deploy:dev     # Run locally with Wrangler
npm run deploy:prod    # Deploy to Cloudflare
```

## Project structure

| Directory                   | Purpose                                                           |
| :-------------------------- | :---------------------------------------------------------------- |
| `src/mcp-server/tools`      | Tool definitions (`*.tool.ts`). Git capabilities live here.       |
| `src/mcp-server/resources`  | Resource definitions (`*.resource.ts`). Git context data sources. |
| `src/mcp-server/transports` | HTTP and STDIO transport implementations, including auth.         |
| `src/storage`               | `StorageService` abstraction and provider implementations.        |
| `src/services`              | Git service provider (CLI-based git operations).                  |
| `src/container`             | DI container registrations and tokens.                            |
| `src/utils`                 | Logging, error handling, performance, security utilities.         |
| `src/config`                | Environment variable parsing and validation (Zod).                |
| `tests/`                    | Unit and integration tests, mirroring `src/` structure.           |

## Response format

Configure output format and verbosity via `MCP_RESPONSE_FORMAT` and `MCP_RESPONSE_VERBOSITY`.

JSON format (default, optimized for LLM consumption):

```json
{
  "success": true,
  "branch": "main",
  "staged": ["src/index.ts", "README.md"],
  "unstaged": ["package.json"],
  "untracked": []
}
```

Markdown format (human-readable):

```
# Git Status: main

## Staged (2)
- src/index.ts
- README.md

## Unstaged (1)
- package.json
```

The LLM always receives the complete structured data via `responseFormatter` — full file lists, metadata, timestamps — regardless of what the client displays. Verbosity controls how much detail is included: `minimal` (core fields only), `standard` (balanced), or `full` (everything).

## Development guide

See [`AGENTS.md`](AGENTS.md) for architecture, tool development patterns, and contribution rules.

## Testing

Tests use [Bun's test runner](https://bun.sh/docs/cli/test) with Vitest compatibility.

```sh
bun test              # Run all tests
bun test --coverage   # With coverage
bun run devcheck      # Lint, format, typecheck, audit
```

## Roadmap

The server uses a provider-based architecture for git operations:

- **CLI provider** (current) — Full 28-tool coverage via native git CLI. Requires local git installation.
- **Isomorphic git provider** (planned) — Pure JS implementation for edge deployment (Cloudflare Workers, Vercel Edge, Deno Deploy). Uses [isomorphic-git](https://isomorphic-git.org/).
- **GitHub API provider** (maybe) — Cloud-native operations via GitHub REST/GraphQL APIs, no local repo required.

## Contributing

Issues and pull requests are welcome. Run checks before submitting:

```sh
npm run devcheck
npm test
```

## License

Apache 2.0. See [LICENSE](./LICENSE).

---

<div align="center">
  <p>Built with the <a href="https://github.com/cyanheads/mcp-ts-template">mcp-ts-template</a></p>
  <p>
    <a href="https://github.com/sponsors/cyanheads">Sponsor this project</a> ·
    <a href="https://www.buymeacoffee.com/cyanheads">Buy me a coffee</a>
  </p>
</div>
