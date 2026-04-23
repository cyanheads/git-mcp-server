---
name: polish-docs-meta
description: >
  Finalize documentation and project metadata for a ship-ready release. Use after implementation is complete, tests pass, and devcheck is clean. Safe to run at any stage — each step checks current state and only acts on what still needs work.
metadata:
  author: cyanheads
  version: '1.0'
  type: workflow
---

## When to Use

- Implementation is functionally complete (tools, resources, prompts, providers all working)
- `bun run devcheck` passes, `bun test` passes
- Preparing for a release, or making surface-area changes that affect README/metadata
- User says "polish", "polish docs", "finalize", "make it ship-ready", "clean up docs", or similar
- Re-running after adding/removing tools, resources, or other surface area changes

Prefer running after implementation is complete, but safe to re-run at any point — steps are idempotent.

## Prerequisites

- [ ] Tools/resources/prompts implemented and registered
- [ ] `bun run devcheck` passes
- [ ] `bun test` passes

If these aren't met, address them first.

## Steps

### 1. Audit the Surface Area

Read the registered definitions. Build a mental model of what the server actually exposes — names, descriptions, input/output shapes, auth scopes. This inventory drives every document below.

Read:

- `src/mcp-server/tools/definitions/index.ts` (the `allToolDefinitions` barrel)
- Every `src/mcp-server/tools/definitions/git-*.tool.ts`
- `src/mcp-server/resources/definitions/index.ts`
- `src/mcp-server/resources/definitions/git-working-directory.resource.ts`
- `src/mcp-server/prompts/definitions/index.ts`
- `src/mcp-server/prompts/definitions/git-wrapup.prompt.ts`
- `src/config/index.ts` (Zod config schema)
- `src/services/git/core/IGitProvider.ts` (provider contract)

Capture: tool count (expected ~29), resource count, prompt count, git provider capabilities, required env vars.

### 2. README.md

Compare README content against the audit. Update tool/resource/prompt tables, env var lists, badges, and descriptions to match actual surface area. Don't rewrite sections that are already accurate.

Specific sync points:

- Version badge reflects `package.json` version
- Tool count in any feature-summary block matches actual count
- The tools table lists every registered tool with a one-line description pulled from `TOOL_DESCRIPTION`
- Config section lists every env var defined in `src/config/index.ts` with current defaults
- Links to external deps (`[Hono](https://hono.dev/)`, `[MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)`, etc.) are on first mention
- Transport examples (stdio + http) are current

### 3. Agent Protocol (CLAUDE.md / AGENTS.md)

`AGENTS.md` is a symlink to `CLAUDE.md` — edit only `CLAUDE.md`.

Review against reality:

- Tool/resource count and file structure claims match the actual codebase
- Directory table in section II reflects what's actually in `src/`
- Code examples use real current APIs (`createToolHandler`, `ToolLogicDependencies`, `IGitProvider`) — not outdated signatures
- If new subsystems were added (e.g., a new provider, new storage backend), the structure diagram in section V is updated
- Checklist in section XIV still covers everything a contributor needs to verify
- Version at the top matches `package.json` version

Keep the diff minimal — change what's stale, leave what's accurate.

### 4. `.env.example`

Compare `.env.example` against the `src/config/index.ts` Zod schema. Add any missing vars with a comment and default. Remove vars for features that no longer exist. Group by category (Transport, Auth, Storage, Git, Telemetry) matching the schema's layout.

Categories to cover:

- **Transport:** `MCP_TRANSPORT_TYPE`, `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_HTTP_PATH`
- **Auth:** `MCP_AUTH_MODE`, `MCP_AUTH_SECRET_KEY`, `OAUTH_ISSUER_URL`, `OAUTH_AUDIENCE`, `OAUTH_JWKS_URI`
- **Storage:** `STORAGE_PROVIDER_TYPE`, `STORAGE_FILESYSTEM_PATH`
- **Git:** `GIT_PROVIDER`, `GIT_SIGN_COMMITS`, `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`, `GIT_BASE_DIR`, `GIT_MAX_COMMAND_TIMEOUT_MS`, `GIT_MAX_BUFFER_SIZE_MB`, `GIT_WRAPUP_INSTRUCTIONS_PATH`
- **Telemetry:** `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_SERVICE_VERSION`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`

### 5. `package.json` Metadata

Check for empty or placeholder fields. Key fields:

| Field            | Source of truth                                           |
| :--------------- | :-------------------------------------------------------- |
| `description`    | Canonical — every other surface derives from it           |
| `version`        | Semver, matches `server.json` and `CHANGELOG.md` headline |
| `mcpName`        | Reverse-domain: `io.github.cyanheads/git-mcp-server`      |
| `repository.url` | `git+https://github.com/cyanheads/git-mcp-server.git`     |
| `bugs.url`       | `https://github.com/cyanheads/git-mcp-server/issues`      |
| `homepage`       | `https://github.com/cyanheads/git-mcp-server#readme`      |
| `keywords`       | Union with GitHub topics (see step 7)                     |
| `engines`        | `bun >=1.2.0`, `node >=20.0.0`                            |
| `packageManager` | Pinned bun version                                        |
| `author`         | `cyanheads <casey@caseyjhand.com>`                        |
| `license`        | `Apache-2.0`                                              |

**`description` is the canonical source.** Every other surface (README header, `server.json`, GitHub repo description) derives from it. Write it here first, then propagate.

### 6. `server.json`

Diff against current state and update stale fields. Key sync points:

- `$schema` set to the current MCP server manifest schema URL
- `name` matches `mcpName` from `package.json`
- `version` matches `package.json` version (in all places: top-level + each `packages[].version`)
- `description` matches `package.json` description
- `environmentVariables` reflect `src/config/index.ts` — server-specific required vars in both entries, transport vars only in HTTP entry
- Package entries cover supported distribution channels (npm stdio, npm http)

### 7. GitHub Repository Metadata

Sync the GitHub repo with `package.json` using `gh`. Skip if `gh` isn't available.

**Description:**

```bash
gh repo edit cyanheads/git-mcp-server --description "$(jq -r .description package.json)"
```

**Topics ↔ Keywords:**

Compare GitHub topics against `package.json` `keywords`. They should be the union — add any that exist in one but not the other.

```bash
gh repo view --json repositoryTopics -q '.repositoryTopics[].name'
jq -r '.keywords[]' package.json
```

- Missing from GitHub → `gh repo edit --add-topic <topic>`
- Missing from `package.json` → add to `keywords` array

Common keywords across MCP servers (`mcp`, `mcp-server`, `model-context-protocol`, `typescript`) should appear in both. Domain-specific keywords (`git`, `version-control`, `branch`, etc.) should also be present in both.

### 8. `CHANGELOG.md`

This repo uses a **monolithic** changelog in [Keep a Changelog](https://keepachangelog.com/) format. Conventions:

- Every release gets a top-level `## v<version> - <YYYY-MM-DD>` header with a concrete version and date — **never** `[Unreleased]`
- Optional one-paragraph narrative intro right under the header
- Grouped sections: `### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Security`
- Breaking changes called out in bold at the top of the relevant section or with a dedicated `### Breaking` header
- Entries reference tool names in code (`` `git_merge` ``), PR/issue numbers (`(#42)`), and user-visible commands
- Oldest releases at the bottom; newest at the top

Before shipping a release, verify the top entry is current, dated, and complete. Hand-editing is expected — no build step.

### 9. `bunfig.toml`

Verify `bunfig.toml` exists at the project root. Expected contents:

```toml
[install]
auto = "fallback"
frozenLockfile = false

[run]
bun = true
```

### 10. `LICENSE`

Confirm the `LICENSE` file exists and matches `package.json` `license` field (Apache-2.0).

### 11. `docs/tree.md`

Regenerate the directory structure:

```bash
bun run tree
```

Review the output for anything unexpected (leftover scaffolding files, missing directories, stray dist artifacts).

### 12. Final Verification

Run the full check suite one last time:

```bash
bun run devcheck
bun test
```

Both must pass clean.

## Checklist

- [ ] Surface area audited — tool/resource/prompt/provider inventory built
- [ ] `README.md` accurate — tool tables, config, descriptions match actual code
- [ ] `CLAUDE.md` accurate — no stale content, real examples, structure matches reality; `AGENTS.md` symlink intact
- [ ] `.env.example` in sync with `src/config/index.ts`
- [ ] `package.json` metadata complete and versioned
- [ ] `server.json` schema + versions + env vars current; matches `package.json`
- [ ] GitHub repo description matches `package.json`; topics ↔ keywords in sync
- [ ] `bunfig.toml` present
- [ ] `CHANGELOG.md` has a concrete-dated entry for the release (Keep a Changelog format)
- [ ] `LICENSE` file present
- [ ] `docs/tree.md` regenerated
- [ ] `bun run devcheck` passes
- [ ] `bun test` passes
