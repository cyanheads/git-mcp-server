---
name: maintenance
description: >
  Investigate, adopt, and verify dependency updates. Captures what changed, understands why, cross-references against the codebase, and runs final checks. Supports two entry modes: run the full flow end-to-end, or review updates you already applied.
metadata:
  author: cyanheads
  version: '1.0'
  type: workflow
---

## When to Use

- After running `bun update --latest` yourself and wanting to review the impact (**Mode B** — typical)
- To run the whole flow end-to-end — outdated check → update → investigate → adopt → verify (**Mode A**)

## Entry Modes

| Mode                       | Starting Point                                                          | First Step                                                   |
| :------------------------- | :---------------------------------------------------------------------- | :----------------------------------------------------------- |
| **A — Full flow**          | Lockfile is current; want to update                                     | Step 1                                                       |
| **B — Post-update review** | User already ran `bun update --latest` + `bun run rebuild` + `bun test` | Skip to Step 3 with the update output or `git diff bun.lock` |

Both modes converge at Step 3 and end at Step 6.

## Steps

### 1. Survey what's outdated (Mode A only)

```bash
bun outdated
```

Note: `bun update --latest` crosses semver majors; `bun update` alone respects ranges. Use `--latest` unless a package is intentionally pinned.

### 2. Apply the update (Mode A only)

```bash
bun update --latest
```

Capture the `↑ package old → new` lines from stdout — these feed Step 3. Alternatively, `git diff bun.lock` surfaces version deltas after the fact.

### 3. Investigate changelogs

For each updated package, fetch the release notes or CHANGELOG entries between old and new versions, then cross-reference changes against actual imports in `src/`. Output per package: what changed, impact on this project, action items.

Focus on packages this server directly depends on:

| Package                                    | Impact Check                                                          |
| :----------------------------------------- | :-------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk`                | Protocol version bumps, breaking handler signatures, new capabilities |
| `hono` / `@hono/node-server` / `@hono/mcp` | HTTP transport API changes, middleware signatures                     |
| `@opentelemetry/*`                         | Instrumentation contract changes, exporter config                     |
| `tsyringe` / `reflect-metadata`            | DI container behavior, decorator semantics                            |
| `jose`                                     | JWT/JWKS verification API                                             |
| `pino` / `pino-pretty`                     | Logger API, transport config                                          |
| `zod`                                      | Schema API (e.g., v3 → v4 refinement changes, `.describe()` behavior) |
| `typescript`                               | New strict checks, lib changes affecting existing types               |
| `vitest` / `@vitest/coverage-v8`           | Test runner behavior, coverage provider changes                       |
| `eslint` / `typescript-eslint`             | New rules flagging existing code                                      |
| Cross-spawn / execa                        | Child-process spawning semantics used by `CliGitProvider`             |

Use `WebFetch` or `Bash + curl` (for full content) against the package's GitHub releases or CHANGELOG. Skim tag-to-tag diffs rather than scrolling the full file.

### 4. Adopt changes in the codebase

Apply findings from Step 3:

- **Breaking changes** — fix call sites (look first under `src/mcp-server/`, `src/services/`, `src/utils/`, `src/storage/`, `src/container/`)
- **Deprecations** — migrate now, while context is fresh
- **New APIs worth adopting** — refactor targeted spots only; don't cargo-cult everywhere
- **New configuration** — update `.env.example`, `src/config/index.ts` Zod schema, and `README.md` if user-facing

Keep diffs focused. Don't sweep refactors beyond the update's scope.

Common spots to re-check:

- `src/services/git/providers/cli/` if child-process libraries changed
- `src/mcp-server/transports/http/` if Hono / MCP SDK changed
- `src/utils/telemetry/` if OpenTelemetry SDK changed
- `src/mcp-server/transports/auth/` if `jose` changed

### 5. Rebuild and verify

```bash
bun run rebuild
bun run devcheck
bun test
```

`rebuild` (clean + build) catches API surface and type-alignment issues that `devcheck` alone may miss — module resolution, path aliases, post-build processing. `devcheck` runs lint, format, typecheck, and security audit.

In **Mode B**, the user already ran rebuild + test before invoking this skill, but run them again here — Step 4 made code changes that need verification.

Fix anything that fails. Re-run until clean.

### 6. Summary

Present a concise numbered summary to the user:

1. **Updated packages** — short list with version deltas (N total)
2. **Breaking changes handled** — call sites fixed
3. **Features adopted** — new APIs now in use
4. **Needs attention** — anything deferred, flagged for decision, or risky
5. **Status** — rebuild / devcheck / test results

## Checklist

- [ ] Update applied (`bun update --latest`) — Mode A, or already done by user — Mode B
- [ ] Changelogs reviewed for each updated package
- [ ] Adoption opportunities identified and applied
- [ ] `bun run rebuild` succeeds
- [ ] `bun run devcheck` passes (lint + format + typecheck + audit)
- [ ] `bun test` passes
- [ ] Numbered summary presented to user
