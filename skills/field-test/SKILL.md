---
name: field-test
description: >
  Exercise git tools, resources, and prompts against a live HTTP server via MCP JSON-RPC over curl. Starts the server, surfaces the catalog, runs real and adversarial inputs, and produces a tight report with concrete findings and numbered follow-up options. Use after adding or modifying definitions, or when the user asks to test, try out, or verify the MCP surface.
metadata:
  author: cyanheads
  version: '1.0'
  type: debug
---

## Context

Unit tests verify handler logic with mocked context. Field testing exercises the real HTTP transport with real JSON-RPC: starts the server, calls `initialize`, surfaces the catalog, runs inputs, and checks what a client actually sees. It catches what unit tests miss — awkward input shapes, unhelpful errors, missing `responseFormatter` output, drift between `structuredContent` and `content[]`, edge-case surprises, and git-specific behavior around conflicts, bare repos, protected branches, working directory state, etc.

**Actively call the tools. Don't read code and guess.**

For git tools specifically: prefer a throwaway test repo (`/tmp/field-test-repo` initialized with `git init` and a seed commit) over the project itself so state changes are bounded and easy to clean up.

---

## Steps

### 1. Start the server

Write the helper to `/tmp/mcp-field-test.sh` once, then source it in every subsequent Bash call. Helper keeps PID / URL / session id in `/tmp/mcp-field-test.env` so state survives across tool invocations.

```bash
cat > /tmp/mcp-field-test.sh <<'HELPER_EOF'
#!/bin/bash
# Field-test helper: manage an MCP HTTP server + JSON-RPC session across shell calls.
STATE_FILE="/tmp/mcp-field-test.env"
[ -f "$STATE_FILE" ] && . "$STATE_FILE"

mcp_start() {
  local dir="${1:-$PWD}"
  echo "building $dir ..."
  (cd "$dir" && bun run rebuild) >/tmp/mcp-build.log 2>&1 \
    || { echo "BUILD FAILED — see /tmp/mcp-build.log"; return 1; }
  echo "starting server ..."
  (cd "$dir" && bun run start:http) >/tmp/mcp-server.log 2>&1 &
  local pid=$!
  local line=""
  for _ in $(seq 1 40); do
    line=$(grep -Eo 'listening at http://[^" ]+/mcp' /tmp/mcp-server.log | head -1)
    [ -n "$line" ] && break
    sleep 0.25
  done
  if [ -z "$line" ]; then
    echo "server failed to start — see /tmp/mcp-server.log"
    kill "$pid" 2>/dev/null
    return 1
  fi
  local url="${line#listening at }"
  local port; port=$(echo "$url" | sed -E 's|.*:([0-9]+)/.*|\1|')
  cat > "$STATE_FILE" <<EOF
export MCP_PID=$pid
export MCP_URL=$url
export MCP_PORT=$port
EOF
  . "$STATE_FILE"
  echo "ready pid=$pid url=$url"
}

mcp_init() {
  [ -z "$MCP_URL" ] && { echo "run mcp_start first"; return 1; }
  local hdr="/tmp/mcp-init-headers.txt"
  curl -sS -D "$hdr" -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"field-test","version":"1.0"}}}' >/dev/null
  local sid; sid=$(grep -i '^mcp-session-id:' "$hdr" | awk '{print $2}' | tr -d '\r\n')
  [ -z "$sid" ] && { echo "no session id returned"; return 1; }
  cat > "$STATE_FILE" <<EOF
export MCP_PID=$MCP_PID
export MCP_URL=$MCP_URL
export MCP_PORT=$MCP_PORT
export MCP_SID=$sid
EOF
  . "$STATE_FILE"
  curl -sS -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $sid" \
    -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null
  echo "session=$sid"
}

# Usage: mcp_call METHOD [JSON_PARAMS]
# Prints the JSON-RPC response (SSE framing stripped). Pipe to `jq`.
mcp_call() {
  [ -z "$MCP_SID" ] && { echo "run mcp_init first"; return 1; }
  local method="$1"; local params="${2:-}"
  local body
  if [ -z "$params" ]; then
    body=$(printf '{"jsonrpc":"2.0","id":%d,"method":"%s"}' "$RANDOM" "$method")
  else
    body=$(printf '{"jsonrpc":"2.0","id":%d,"method":"%s","params":%s}' "$RANDOM" "$method" "$params")
  fi
  curl -sS -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $MCP_SID" \
    -d "$body" | sed -n 's/^data: //p'
}

mcp_stop() {
  [ -n "$MCP_PID" ] && kill "$MCP_PID" 2>/dev/null
  rm -f "$STATE_FILE"
  echo "stopped"
}
HELPER_EOF

. /tmp/mcp-field-test.sh
mcp_start /Users/casey/Developer/github/git-mcp-server
```

**Notes**

- `MCP_HTTP_PORT` is a _starting_ port — the server auto-increments if taken. Helper parses the real URL from the log (`HTTP transport listening at ...`).
- If `bun run rebuild` fails, stop. Don't field-test broken code — fix the build first.
- If a server is already listening on the project's port (`lsof -i :<port>`), confirm with the user before killing it; it may be their own session.
- `MCP_AUTH_MODE=none` is the default dev configuration — no auth headers needed.

### 2. Initialize the session

```bash
. /tmp/mcp-field-test.sh
mcp_init
```

Runs `initialize`, captures the session id, sends `notifications/initialized`.

### 3. Prepare a test repository

Most git tools require a working directory. Create a sandboxed repo once:

```bash
TEST_REPO=/tmp/field-test-repo
rm -rf "$TEST_REPO" && mkdir -p "$TEST_REPO"
(cd "$TEST_REPO" && \
  git init -q && \
  git config user.email "field-test@example.com" && \
  git config user.name "Field Test" && \
  echo "initial" > README.md && \
  git add README.md && \
  git commit -q -m "initial commit")
echo "test repo ready at $TEST_REPO"
```

Pass `$TEST_REPO` as the `path` argument in tool calls (never `.`, since that resolves to session state).

For tests that don't need a repo (e.g. `git_clone`, `git_set_working_dir`), use `/tmp/field-test-dest` or similar.

### 4. Surface the catalog

```bash
. /tmp/mcp-field-test.sh
mcp_call tools/list     | jq '.result.tools[]     | {name, description, inputSchema}'
mcp_call resources/list | jq '.result.resources[] | {uri, name, mimeType}'
mcp_call prompts/list   | jq '.result.prompts[]   | {name, description, arguments}'
```

Present a compact catalog to the user: each definition's name + 1-line description. Flag vague or missing descriptions as you go — those feed into the report.

### 5. Plan the test pass

**Budget.** This server exposes ~29 git tools. Don't run every category against every tool — the cross-product is infeasible. Apply the **universal battery** to everything; apply **situational categories** only when the tool triggers them.

**Universal battery — run on every tool**

| Category                                 | What to verify                                                                                                            |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| Happy path                               | One realistic input against `$TEST_REPO`. Output shape matches `outputSchema`. `content[]` text reads clearly to a human. |
| `structuredContent` ↔ `content[]` parity | Every field in `structuredContent` is surfaced in the text. Parity gap = client-specific blindness.                       |
| Input error                              | One invalid input (wrong type or missing required). Error text says _what_, _why_, _how to fix_.                          |

**Situational — add only when triggered**

| Trigger                                                                                  | Add category                                                                                                |
| :--------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| `verbosity` / `fields` / `include` parameter                                             | Field selection: verify `minimal` / `standard` / `full` actually differ                                     |
| Array return with `query` / `filter` inputs (e.g. `git_log`)                             | Empty result: does response explain _why_ (echo criteria, suggest broadening)?                              |
| Destructive flags (`--hard`, `--force`, `git_clean`)                                     | Confirm guard: does the tool require explicit flag to proceed?                                              |
| Conflict-producing operations (`git_merge`, `git_rebase`, `git_cherry_pick`, `git_pull`) | Construct a conflict on purpose; confirm `{ success: true, conflicts: true, conflictedFiles: [...] }` shape |
| Requires remote (`git_fetch`, `git_pull`, `git_push`, `git_clone`)                       | Either point at a local bare repo file:// URL or skip with a note                                           |
| Bare-repo-only behavior (`git_init --bare`)                                              | Verify `isBare: true` surfaces; verify `git_add`/`git_commit` reject                                        |
| `annotations.readOnlyHint: true`                                                         | Confirm no mutation happened                                                                                |
| Session working directory (`path: "."`)                                                  | Run `git_set_working_dir`, then a read-only tool with `path: "."` to confirm resolution                     |
| Chained workflows (status → add → commit → log)                                          | Run one representative chain end-to-end                                                                     |

**Resources.** `git-working-directory.resource.ts`: happy path, unset state (before `git_set_working_dir` is called).
**Prompts.** `git-wrapup.prompt.ts`: happy path, skim message quality.

**Sampling strategy.** Run the universal battery on all 29 tools, but pick roughly 30–40% for situational testing. Weight toward: write-shaped tools, tools with complex schemas, tools that integrate multiple operations (`git_merge`, `git_rebase`, `git_stash`, `git_worktree`). List which ones you skipped in the report.

**External state.**

- `git_push` / `git_clone` against real remotes: use `file://` URLs to local bare repos, or skip with a note.
- Tools that write to real external systems should never touch the user's real `origin`.

### 6. Execute

Use `TaskCreate` — one task per tool (or logical group). Mark complete as you go. Don't batch.

For each call, capture: input sent, response (trim huge payloads to files), whether `isError: true` appeared, anything surprising (slow response, parity drift, unhelpful text, crash).

**Interpreting responses**

- Tool domain errors return `{result: {content: [...], isError: true}}` — they live in `result`, not `error`. Check `isError`, not the JSON-RPC error field.
- JSON-RPC `error` only appears for protocol issues (bad session, malformed envelope, unknown method).
- `mcp_call` already strips SSE framing. Pipe to `jq` for readability.
- Structured git errors throw `McpError` with `code` and `context`. The `content[]` should echo the error reason in human-readable form.

### 7. Tear down

```bash
. /tmp/mcp-field-test.sh
mcp_stop
rm -rf /tmp/field-test-repo /tmp/field-test-dest
```

Kills the background server, clears state, removes test repos. Do this _before_ writing the report so nothing leaks into the next session.

### 8. Report

Three sections. Tight. The user should be able to skim the summary, read details only for what matters, and act on numbered options.

#### Summary (1 paragraph)

One paragraph. How many tools exercised, how many passed clean, how many have issues, and the single most important finding. No tables, no lists.

#### Findings

Only include definitions with issues. Group by severity. Each finding is 2–4 lines unless it genuinely needs more.

| Severity | Meaning                                                                                                                                                        |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **bug**  | Broken: crash, wrong output, `isError: true` on valid input, data loss, schema violation                                                                       |
| **ux**   | Works but degrades the user/LLM experience: vague description, unhelpful error text, missing `responseFormatter`, parity drift, annotation mismatches behavior |
| **nit**  | Polish: phrasing, inconsistent tone, minor doc gaps                                                                                                            |

Format:

```
**<tool_name> — <bug|ux|nit>**
Input: `<short input>` → <what happened>
Expected: <what should happen>
Fix: <one sentence>
```

#### Options

Numbered, actionable, cherry-pickable. Each item maps to a concrete change.

```
1. Fix conflict-handling in `git_rebase` — currently throws instead of returning `{conflicts: true}` (finding #2)
2. Add `conflictedFiles` to `minimal` verbosity of `git_pull` (finding #5)
3. Tighten `commitRef` description in `git_show` — silent on short-SHA vs full-SHA (finding #8)
```

End with:

> Pick by number (e.g. "do 1, 3, 5" or "expand on 2").

---

## Checklist

- [ ] Server built and started; real port parsed from log
- [ ] Session initialized; `notifications/initialized` sent
- [ ] Test repo scaffolded at `/tmp/field-test-repo`
- [ ] Catalog surfaced and presented
- [ ] Universal battery run on every tool
- [ ] Situational categories applied only when triggered
- [ ] Remote-dependent tools handled explicitly (local bare repo or skipped)
- [ ] Server stopped; test repos cleaned up; state file removed
- [ ] Report: summary paragraph → grouped findings → numbered options
