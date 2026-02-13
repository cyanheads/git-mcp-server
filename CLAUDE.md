# Agent Protocol & Architectural Mandate

**Version:** 2.5.0
**Target Project:** git-mcp-server
**Last Updated:** 2026-02-12

This document defines the operational rules for contributing to this codebase. Follow it exactly.

> **Note on File Synchronization**: `AGENTS.md` is a symlink to `CLAUDE.md`. **Edit only `CLAUDE.md`** — `AGENTS.md` will reflect changes automatically.

---

## I. Core Principles (Non-Negotiable)

1. **The Logic Throws, The Handler Catches**
   - **Tools:** Implement pure, stateless business logic inside tool logic functions. **No `try/catch` blocks.**
   - **Resources:** Same rule — pure read logic, no `try/catch`.
   - **On Failure:** Throw `new McpError(...)` with the appropriate `JsonRpcErrorCode` and context.
   - **Framework's Job:**
     - `createMcpToolHandler` wraps tool logic: creates `RequestContext`, measures execution via `measureToolExecution`, formats the response, catches errors.
     - `createToolHandler` wraps git-specific logic: resolves DI dependencies and working directory before calling your pure logic.
     - Resource handlers (`resourceHandlerFactory`) validate params, invoke logic, apply `responseFormatter`, and catch errors.

2. **Full-Stack Observability**
   - OpenTelemetry is preconfigured. Logs and errors are automatically correlated to traces.
   - `measureToolExecution` automatically records duration, success, payload sizes, and error codes for every tool call.
   - Do not add custom spans in tool/resource logic. The framework handles instrumentation.

3. **Structured, Traceable Operations**
   - Tool logic receives dependencies via `ToolLogicDependencies` (which includes `appContext` and `sdkContext`).
   - `appContext` (`RequestContext`): Internal logging/tracing context with `requestId`, `sessionId`, `tenantId`, `traceId`.
   - `sdkContext` (`SdkContext`): MCP SDK protocol capabilities — `signal`, `sendNotification`, `sendRequest`, `authInfo`.
   - Pass `appContext` through your internal call stack. Use the global `logger` with `appContext` in every log call.

4. **Decoupled Storage**
   - Never directly access persistence backends from tool/resource logic.
   - Use `StorageService` (injected via DI) for session state (working directory persistence).
   - Git operations execute via the `IGitProvider` interface, not direct CLI calls.

5. **Graceful Degradation in Development**
   - When `tenantId` is missing, default to permissive behavior: `const tenantId = appContext.tenantId || 'default-tenant';`
   - Auth/scope checks default to allowed when auth is disabled.
   - Production environments with auth enabled provide real `tenantId` from JWT claims automatically.

---

## II. Directory Structure

| Directory                               | Purpose                                                                                                                                                             |
| :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/mcp-server/tools/definitions/`     | MCP Tool definitions. Named `git-[operation].tool.ts`.                                                                                                              |
| `src/mcp-server/tools/utils/`           | Shared tool utilities: `toolDefinition.ts`, `toolHandlerFactory.ts`, `git-validators.ts`, `json-response-formatter.ts`.                                             |
| `src/mcp-server/tools/schemas/`         | Shared Zod schemas: `PathSchema`, `CommitRefSchema`, `BranchNameSchema`, etc.                                                                                       |
| `src/mcp-server/resources/definitions/` | MCP Resource definitions. Primary: `git-working-directory.resource.ts`.                                                                                             |
| `src/mcp-server/resources/utils/`       | Shared resource utilities: `ResourceDefinition` and handler factory.                                                                                                |
| `src/mcp-server/prompts/definitions/`   | MCP Prompt definitions (e.g., `git-wrapup.prompt.ts`).                                                                                                              |
| `src/mcp-server/transports/`            | Transport implementations: `http/` (Hono + Streamable HTTP), `stdio/`, `auth/` (JWT/OAuth strategies).                                                              |
| `src/services/git/`                     | Git service: `core/` (interfaces, factory), `providers/cli/` (CLI implementation with domain-organized operations).                                                 |
| `src/storage/`                          | Storage abstractions and providers (in-memory, filesystem, supabase, cloudflare).                                                                                   |
| `src/container/`                        | Dependency injection (`tsyringe`). Service registration and tokens.                                                                                                 |
| `src/utils/`                            | Global utilities: `internal/` (logger, requestContext, ErrorHandler, performance), `security/` (sanitization), `parsing/`, `telemetry/`, `network/`, `scheduling/`. |
| `tests/`                                | Unit/integration tests mirroring `src/` structure.                                                                                                                  |

---

## III. Tool Development Workflow

### Step 1 — File Location

- Place new tools in `src/mcp-server/tools/definitions/`.
- Name files `git-[operation].tool.ts` (e.g., `git-commit.tool.ts`, `git-status.tool.ts`).
- Use existing tools as reference (e.g., `git-status.tool.ts`).

### Step 2 — Define the ToolDefinition

Export a single `const` named `[toolName]Tool` of type `ToolDefinition` with:

- `name`: Programmatic tool name, `snake_case` with `git_` prefix (e.g., `git_status`, `git_commit`).
- `title` (optional): Human-readable title (e.g., `'Git Status'`).
- `description`: Clear, LLM-facing description.
- `inputSchema`: A `z.object({ ... })`. **Every field must have `.describe()`**. Use shared schemas from `schemas/common.ts` (`PathSchema`, `CommitRefSchema`, etc.).
- `outputSchema`: A `z.object({ ... })` describing the successful output structure.
- `annotations` (optional): UI/behavior hints (`readOnlyHint`, `openWorldHint`, etc.).
- `logic`: Wrapped with `createToolHandler` (see below).
- `responseFormatter` (optional): Use `createJsonFormatter` for consistent output.

### Step 3 — Implement Logic with `createToolHandler`

Tool logic uses a **two-tier handler pattern**:

1. **`createToolHandler`** resolves DI dependencies (StorageService, GitProviderFactory) once via lazy closure, resolves the working directory from `input.path`, and passes everything to your pure logic function as `ToolLogicDependencies`.
2. **`createMcpToolHandler`** (framework-level) wraps everything for the MCP SDK: context creation, performance measurement, error handling, response formatting.

Your logic function receives `(input, deps: ToolLogicDependencies)`:

```typescript
interface ToolLogicDependencies {
  provider: IGitProvider; // Git provider, already resolved
  storage: StorageService; // Storage service, already resolved
  appContext: RequestContext; // Request context for logging/tracing
  sdkContext: SdkContext; // MCP SDK context (signal, sendNotification, etc.)
  targetPath: string; // Resolved working directory (from input.path)
}
```

For tools that don't need path resolution (e.g., `git_clone`, `git_set_working_dir`), pass `{ skipPathResolution: true }`:

```typescript
logic: withToolAuth(['tool:git:write'],
  createToolHandler(myLogic, { skipPathResolution: true })
),
```

### Step 4 — Apply Authorization

Wrap `logic` with `withToolAuth`:

```typescript
logic: withToolAuth(['tool:git:read'], createToolHandler(gitStatusLogic)),
```

**Scopes:** `tool:git:read` for read-only, `tool:git:write` for mutations.

### Step 5 — Register via Barrel Export

Add your tool to `src/mcp-server/tools/definitions/index.ts` in `allToolDefinitions`.

### Complete Example

```typescript
/**
 * @fileoverview Git status tool - show working tree status
 * @module mcp-server/tools/definitions/git-status
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema } from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_status';
const TOOL_TITLE = 'Git Status';
const TOOL_DESCRIPTION =
  'Show the working tree status including staged, unstaged, and untracked files.';

const InputSchema = z.object({
  path: PathSchema,
  includeUntracked: z
    .boolean()
    .default(true)
    .describe('Include untracked files in the output.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  currentBranch: z.string().nullable().describe('Current branch name.'),
  isClean: z.boolean().describe('True if working directory is clean.'),
  stagedChanges: z
    .object({
      added: z
        .array(z.string())
        .optional()
        .describe('Files added to the index.'),
      modified: z
        .array(z.string())
        .optional()
        .describe('Files modified and staged.'),
      deleted: z
        .array(z.string())
        .optional()
        .describe('Files deleted and staged.'),
    })
    .describe('Changes staged for the next commit.'),
  unstagedChanges: z
    .object({
      modified: z
        .array(z.string())
        .optional()
        .describe('Files modified but not staged.'),
      deleted: z
        .array(z.string())
        .optional()
        .describe('Files deleted but not staged.'),
    })
    .describe('Changes not yet staged.'),
  untrackedFiles: z.array(z.string()).describe('Untracked files.'),
  conflictedFiles: z.array(z.string()).describe('Files with merge conflicts.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

// Pure business logic — receives pre-resolved dependencies
async function gitStatusLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const result = await provider.status(
    { includeUntracked: input.includeUntracked },
    {
      workingDirectory: targetPath,
      requestContext: appContext,
      tenantId: appContext.tenantId || 'default-tenant',
    },
  );

  return {
    success: true,
    currentBranch: result.currentBranch,
    isClean: result.isClean,
    stagedChanges: result.stagedChanges,
    unstagedChanges: result.unstagedChanges,
    untrackedFiles: result.untrackedFiles,
    conflictedFiles: result.conflictedFiles,
  };
}

// Verbosity filter for response formatting
function filterGitStatusOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  if (level === 'minimal') {
    return {
      success: result.success,
      currentBranch: result.currentBranch,
      isClean: result.isClean,
    };
  }
  return result; // standard & full return everything
}

const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitStatusOutput,
});

export const gitStatusTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], createToolHandler(gitStatusLogic)),
  responseFormatter,
};
```

---

### Response Formatter: JSON Output Pattern

All tools use `createJsonFormatter` for consistent, machine-readable JSON output with verbosity control (`minimal`, `standard`, `full`).

**Basic usage:**

```typescript
import {
  createJsonFormatter,
  shouldInclude,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

function filterOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  return {
    success: result.success,
    commitHash: result.commitHash,
    ...(shouldInclude(level, 'standard') && { files: result.files }),
    ...(shouldInclude(level, 'full') && {
      detailedStatus: result.detailedStatus,
    }),
  };
}

const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterOutput,
});
```

**Rules:**

- Include or omit entire fields based on verbosity — never truncate arrays.
- Return complete arrays when included (LLMs need full context).
- For simple tools with minimal output, omit the filter entirely: `createJsonFormatter<ToolOutput>()`.

**Additional utilities:** `filterByVerbosity()`, `mergeFilters()`, `createFieldMapper()`, `createConditionalFilter()`.

---

## IV. Tool Layer vs Service Layer

**Tools MUST use the `IGitProvider` interface for all git operations.** Direct git command execution is forbidden in the tool layer.

```
┌─────────────────────────────────────────────────┐
│           Tool Layer (src/mcp-server/tools/)    │
│  - Input validation (Zod schemas)               │
│  - Path resolution (via createToolHandler)      │
│  - Output formatting for LLM                    │
│  - Pure validators (no git execution)           │
└─────────────────────┬───────────────────────────┘
                      │ IGitProvider interface
                      ▼
┌─────────────────────────────────────────────────┐
│          Service Layer (src/services/git/)      │
│  - Git command execution                        │
│  - Git-specific validators                      │
│  - Output parsing & error transformation        │
└─────────────────────────────────────────────────┘
```

### Validator Location Rules

| Validator Type                        | Location                                      | Reason                            |
| ------------------------------------- | --------------------------------------------- | --------------------------------- |
| Path sanitization                     | Tool layer (`git-validators.ts`)              | Security, no git execution        |
| Session directory resolution          | Tool layer (`git-validators.ts`)              | Uses StorageService               |
| Protected branch checks               | Tool layer (`git-validators.ts`)              | Pure logic                        |
| File path / commit message validation | Tool layer (`git-validators.ts`)              | Pure validation                   |
| Git repository validation             | Service layer (`cli/utils/git-validators.ts`) | Executes `git rev-parse`          |
| Branch existence check                | Service layer (`cli/utils/git-validators.ts`) | Executes `git rev-parse --verify` |
| Clean working dir check               | Service layer (`cli/utils/git-validators.ts`) | Executes `git status --porcelain` |
| Remote existence check                | Service layer (`cli/utils/git-validators.ts`) | Executes `git remote get-url`     |

### Working Directory Resolution

Handled automatically by `createToolHandler`. When `input.path` is `'.'`, it loads from session storage using key `session:workingDir:{tenantId}`. When it's an absolute path, it's used directly. All paths are sanitized to prevent directory traversal.

---

## V. Git Service Architecture

The git service uses a **provider-based architecture** with the CLI provider as the current implementation.

### Structure

```
src/services/git/
├── core/
│   ├── IGitProvider.ts           # Provider interface contract
│   ├── BaseGitProvider.ts        # Shared provider functionality
│   └── GitProviderFactory.ts     # Provider selection and caching
├── providers/cli/
│   ├── CliGitProvider.ts         # Main provider class
│   ├── operations/               # Operations organized by domain
│   │   ├── core/                 # init, clone, status, clean
│   │   ├── staging/              # add, reset
│   │   ├── commits/              # commit, log, show, diff
│   │   ├── branches/             # branch, checkout, merge, rebase, cherry-pick
│   │   ├── remotes/              # remote, fetch, push, pull
│   │   ├── tags/                 # tag
│   │   ├── stash/                # stash
│   │   ├── worktree/             # worktree
│   │   ├── history/              # blame, reflog
│   │   └── index.ts              # Single barrel export
│   └── utils/                    # CLI-specific utilities and validators
├── types.ts                       # Shared git types and DTOs
└── index.ts                       # Public API
```

### Key Design Principles

- Each file handles exactly one operation (one function per file).
- All operations are stateless async functions that throw `McpError` on failure.
- Operations receive an `execGit` function for executing git commands, keeping them testable.
- Single barrel export at `operations/index.ts` (no nested barrels).

### IGitProvider Interface

All providers implement: init, clone, status, clean, add, commit, log, show, diff, branch, checkout, merge, rebase, cherryPick, remote, fetch, push, pull, tag, stash, worktree, reset, blame, reflog.

Each provider declares capabilities via `GitProviderCapabilities`, allowing consumers to check feature support.

### Provider Types

- **CLI** (`GitProviderType.CLI`): Full feature set, local-only (default, current)
- **Isomorphic** (`GitProviderType.ISOMORPHIC`): Edge-compatible (planned)

---

## VI. Resource Development Workflow

Resources follow the same pattern as tools with a declarative `ResourceDefinition`.

- Place in `src/mcp-server/resources/definitions/` as `[resource-name].resource.ts`.
- Export a `const` of type `ResourceDefinition` with: `name`, `description`, `uriTemplate`, `paramsSchema`, `logic`, and optional `responseFormatter`.
- Wrap logic with `withResourceAuth(['resource:git:read'], ...)`.
- Register in `src/mcp-server/resources/definitions/index.ts` via `allResourceDefinitions`.
- Logic is pure (no `try/catch`) — throw `McpError` on failure.

---

## VII. Core Services & Utilities

### DI-Managed Services (tokens in `src/container/tokens.ts`)

| Token                     | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `StorageService`          | Session state (working directory persistence) |
| `GitProviderFactory`      | Git provider selection and caching            |
| `Logger`                  | Pino-backed structured logging                |
| `AppConfig`               | Validated environment configuration           |
| `RateLimiterService`      | Optional rate limiting for HTTP transport     |
| `CreateMcpServerInstance` | Factory resolved by `TransportManager`        |
| `TransportManagerToken`   | Manages stdio/HTTP transport lifecycle        |

### Directly Imported Utilities

- `logger` — Global Pino logger instance
- `requestContextService` — AsyncLocalStorage-based context propagation
- `ErrorHandler.tryCatch` — For services/infrastructure (NOT in tool/resource logic)
- `sanitization` — **Critical** for path validation and directory traversal prevention
- `measureToolExecution` — Performance measurement (used by handlers automatically)

### Key Utility Modules (`src/utils/`)

| Module       | Key Exports                                                                             |
| :----------- | :-------------------------------------------------------------------------------------- |
| `internal/`  | `logger`, `requestContextService`, `ErrorHandler`, `performance` (measureToolExecution) |
| `security/`  | `sanitization` (path/input validation), `rateLimiter`, `idGenerator`                    |
| `parsing/`   | `jsonParser`, `yamlParser`                                                              |
| `telemetry/` | OpenTelemetry instrumentation                                                           |
| `network/`   | `fetchWithTimeout`                                                                      |

---

## VIII. Authentication & Authorization

### HTTP Transport

- **Modes:** `MCP_AUTH_MODE` = `'none'` | `'jwt'` | `'oauth'`
- **JWT mode:** Uses `MCP_AUTH_SECRET_KEY`. In dev without the secret, verification is bypassed.
- **OAuth mode:** Verifies tokens via remote JWKS. Requires `OAUTH_ISSUER_URL` and `OAUTH_AUDIENCE`.
- **Extracted claims:** `clientId`, `scopes`, `subject`, `tenantId` (from `'tid'` claim).
- **Scope enforcement:** Always wrap logic with `withToolAuth` or `withResourceAuth`. Defaults to allowed when auth is disabled.

### STDIO Transport

No HTTP-based auth. Authorization handled by the host application.

### HTTP Endpoints

- `GET /healthz` — Unprotected health check
- `GET /.well-known/oauth-protected-resource` — RFC 9728 protected resource metadata (unprotected, for discovery)
- `GET /mcp` — Unprotected server identity and config summary
- `POST /mcp` — JSON-RPC transport (protected when auth enabled)
- `DELETE /mcp` — Session termination (MCP Spec 2025-06-18)
- CORS enabled via `MCP_ALLOWED_ORIGINS` or `'*'` fallback

---

## IX. Server Lifecycle

### `createMcpServerInstance` (`src/mcp-server/server.ts`)

- Configures `RequestContext` global settings.
- Creates `McpServer` with capabilities: `logging`, `resources` (listChanged), `tools` (listChanged), `prompts` (listChanged).
- Registers all capabilities via DI-managed registries: `ToolRegistry`, `ResourceRegistry`, `PromptRegistry`.

### `TransportManager`

- Resolves `CreateMcpServerInstance` to get a configured `McpServer`.
- Based on `MCP_TRANSPORT_TYPE`, starts the appropriate transport (`http` or `stdio`).
- Handles graceful startup and shutdown.

### Worker (Edge) — Experimental

- `worker.ts` adapts the server for Cloudflare Workers.
- Git CLI operations require local filesystem access — edge deployment is experimental.

---

## X. Code Style & Security

- **JSDoc:** Every file: `@fileoverview` and `@module`. Document exported APIs.
- **Validation:** All inputs validated via Zod. Every schema field must have `.describe()`.
- **Logging:** Always include `RequestContext`. Use `logger.debug/info/warning/error` appropriately.
- **Error Handling:** Logic throws `McpError`; handlers catch. Use `ErrorHandler.tryCatch` in services only.
- **Secrets:** Access via `src/config/index.ts`. Never hard-code.

### Git-Specific Security

- **Path Sanitization:** All paths MUST use `sanitization` utilities to prevent directory traversal.
- **Command Injection:** Git command arguments must be validated — never from unsanitized input.
- **Destructive Operations:** `git reset --hard`, `git clean -fd` require explicit confirmation flags.

---

## XI. Configuration & Environment

All configuration validated via Zod in `src/config/index.ts`. Derives `serviceName` and `version` from `package.json` if not provided.

| Category      | Variables                                                                                                                                                                                                                                                  |
| :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transport** | `MCP_TRANSPORT_TYPE` (`stdio`/`http`), `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_HTTP_PATH`                                                                                                                                                                   |
| **Auth**      | `MCP_AUTH_MODE` (`none`/`jwt`/`oauth`), `MCP_AUTH_SECRET_KEY`, `OAUTH_ISSUER_URL`, `OAUTH_AUDIENCE`, `OAUTH_JWKS_URI`                                                                                                                                      |
| **Storage**   | `STORAGE_PROVIDER_TYPE` (`in-memory`/`filesystem`/`supabase`/`cloudflare-r2`/`cloudflare-kv`), `STORAGE_FILESYSTEM_PATH`                                                                                                                                   |
| **Git**       | `GIT_PROVIDER` (`auto`/`cli`/`isomorphic`), `GIT_SIGN_COMMITS`, `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`, `GIT_BASE_DIR`, `GIT_MAX_COMMAND_TIMEOUT_MS`, `GIT_MAX_BUFFER_SIZE_MB`, `GIT_WRAPUP_INSTRUCTIONS_PATH` |
| **Telemetry** | `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_SERVICE_VERSION`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`                                                                                                                   |

---

## XII. Workflow Commands

| Command                              | Purpose                                                                                |
| :----------------------------------- | :------------------------------------------------------------------------------------- |
| `bun rebuild`                        | Clean and rebuild; clears logs. Run after dependency changes.                          |
| `bun devcheck`                       | Lint, format, typecheck, security audit. Flags: `--no-fix`, `--no-lint`, `--no-audit`. |
| `bun test`                           | Run unit/integration tests.                                                            |
| `bun run dev:stdio` / `dev:http`     | Development mode.                                                                      |
| `bun run start:stdio` / `start:http` | Production mode (after build).                                                         |
| `bun run build:worker`               | Build Cloudflare Worker bundle.                                                        |

---

## XIII. Multi-Tenancy

- `StorageService` requires `context.tenantId` — throws `McpError` if missing.
- In HTTP + auth mode, `tenantId` is automatically extracted from JWT `'tid'` claim.
- In development (STDIO/no auth), use graceful degradation: `appContext.tenantId || 'default-tenant'`.
- The `createToolHandler` factory handles this pattern for you — `resolveWorkingDirectory` applies it internally.

---

## XIV. Quick Checklist

- [ ] Tool/resource logic in `*.tool.ts` or `*.resource.ts`, pure (no `try/catch`).
- [ ] Throws `McpError` for failures.
- [ ] Uses `createToolHandler` for dependency injection and path resolution.
- [ ] Wrapped with `withToolAuth` or `withResourceAuth`.
- [ ] Uses `logger` with `appContext` for logging.
- [ ] All file paths validated via `sanitization` utilities.
- [ ] Git command arguments validated (no command injection).
- [ ] Registered in `index.ts` barrel file.
- [ ] Tests added/updated (`bun test`).
- [ ] `bun run devcheck` passes.
- [ ] Smoke-tested local transports (`dev:stdio`/`dev:http`).
