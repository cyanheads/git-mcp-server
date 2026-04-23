---
name: report-issue
description: >
  File a bug or feature request against this repository (cyanheads/git-mcp-server) using the `gh` CLI. Use for tool logic bugs, git provider misbehavior, transport issues, auth/config problems, or new feature proposals.
metadata:
  author: cyanheads
  version: '1.0'
  type: workflow
---

## When to Use

Typical triggers:

- A git tool handler returns wrong results or throws on valid input
- A git provider (`CliGitProvider`) fails or misbehaves — wrong output parsing, error transformation, timeout handling
- Transport bugs — HTTP (Hono + Streamable HTTP), stdio, SSE framing, session handling
- Auth bugs — JWT / OAuth / scope enforcement
- Storage backend misbehaves — in-memory, filesystem, supabase, cloudflare
- Domain logic errors — wrong git output, missing edge cases, bad state transitions
- Resource handlers return stale, incomplete, or incorrect data
- Missing or incorrect `.describe()` on schema fields causing poor LLM tool use
- Feature requests — new git operations, verbosity levels, response fields, auth strategies, storage providers

For general `gh` CLI workflows outside issue filing (PRs, workflows, API access), see the `github-cli` skill.

## Before Filing

1. **Confirm the repo**:

   ```bash
   gh repo view --json nameWithOwner -q '.nameWithOwner'
   ```

   Should output `cyanheads/git-mcp-server`.

2. **Search existing issues**:

   ```bash
   gh issue list --search "your error message or keyword"
   ```

3. **Reproduce the issue** — confirm it's reproducible. Note the exact input, transport mode (stdio/http), git provider (cli), and any relevant env vars (`GIT_SIGN_COMMITS`, `GIT_BASE_DIR`, `STORAGE_PROVIDER_TYPE`, etc.).

4. **Check logs** — review server output and, if running HTTP, the response body for structured error details (`McpError` code + context).

5. **Capture versions** — `bun pm ls @cyanheads/git-mcp-server`, `bun --version`, `git --version`, OS version.

## Writing Well-Structured Issues

Good issues are scannable, concrete, and self-contained. These patterns apply to both bugs and features — the guidance targets any prose block (Description, Additional context, feature proposals).

- **Lead with specifics.** Name the tool, provider, resource, or symptom. "Currently `git_merge` throws `McpError(INTERNAL_ERROR)` on a CONFLICT exit instead of returning `{conflicts: true}`" beats "Merge is broken." A reader should know what's wrong before the end of the first sentence.
- **Embed library/service links on first mention.** `[Hono](https://hono.dev/)`, `[tsyringe](https://github.com/microsoft/tsyringe)`, `[jose](https://github.com/panva/jose)`. Link to the canonical repo so readers can verify the dependency and reach docs in one click.
- **Use `owner/repo#N` for cross-repo issue references.** GitHub auto-renders them as linked references (e.g. `cyanheads/mcp-ts-template#46`). Bare `#N` only works for same-repo issues.
- **Add a `Related: #N` line** near the top when the issue grows from prior context (discussions, other issues, PRs). Makes provenance clickable.
- **Lead design sections with a philosophy sentence.** Bold a short principle before the tradeoff details — e.g. "Philosophy: **conflicts are a structured success, not an error.**" Establishes the lens for the rest of the section.
- **Prefer Markdown tables for comparisons.** When showing options, strategies, or tradeoffs — tables are the highest-density format for scanning N rows × M attributes.
- **Separate `### Scope` from `### Out of scope`.** The latter is as important as the former — it pre-empts scope-creep debates in comments and signals you've thought about the boundaries.
- **Use `Depends on: owner/repo#N`** to declare ordering explicitly when implementation is blocked on another issue landing first.
- **Skip collaborator-framing sign-offs.** Lines like "Happy to open a PR", "let me know if you'd like", "willing to contribute" read as noise. A PR link beats an offer; if you're the maintainer filing against your own repo, the offer is redundant. End the body at the last substantive point.

## Redact Before Posting

GitHub issues are **public**. Do not include secrets, credentials, API keys, JWT tokens, or git remote URLs that encode credentials. Redact sensitive values from env vars, headers, logs, and git URLs before submitting. Replace with obvious placeholders: `REDACTED`, `sk-...REDACTED`, `https://REDACTED@github.com/...`. Do not rely on partial masking — partial keys can still be exploited.

## Filing a Bug

This repo does **not** currently ship `.github/ISSUE_TEMPLATE/` YAML form templates, so use free-form titles and bodies. Structure the body with the sections below so the maintainer has everything needed to triage without asking.

### CLI (non-interactive)

````bash
gh issue create \
  --title "bug(git_merge): conflicts thrown as McpError instead of structured success" \
  --label "bug" \
  --body "$(cat <<'ISSUE'
### Version

git-mcp-server v2.11.1

### Runtime

Bun 1.2.21 on macOS 15.x

### Transport

http (also reproduces on stdio)

### Git provider

cli (git 2.x)

### Description

`git_merge` currently throws `McpError(INTERNAL_ERROR)` when the merge exits non-zero due to a `CONFLICT` marker. Callers have to parse error messages and re-run `git_status` to recover state, even though `CONFLICT` is a documented success state.

### Steps to reproduce

1. Set up a repo with two divergent branches that touch the same line
2. `git_checkout { "branch": "main" }`
3. `git_merge { "branch": "feature" }` → throws instead of returning conflict info

### Actual behavior

```
McpError: INTERNAL_ERROR — git merge failed with exit code 1
```

### Expected behavior

```json
{
  "success": true,
  "conflicts": true,
  "conflictedFiles": ["path/to/file.ts"],
  "message": "Merge had conflicts — resolve and commit to finish"
}
```

### Additional context

`git_rebase`, `git_cherry_pick`, `git_pull` share the same pattern and exhibit the same behavior.
ISSUE
)"
````

### Browser (interactive)

```bash
gh issue create --web
```

Opens the standard GitHub issue form; use the body template above as a guide.

### Title conventions

Format: `type(scope): description`

- **type:** `bug`, `feat`, `docs`, `chore`, `perf`, `refactor`
- **scope:** tool name (`git_status`, `git_merge`), subsystem (`cli-provider`, `transport`, `auth`, `storage`, `config`), or `types`

Examples:

- `bug(git_commit): signing fails silently when gpg agent is unavailable`
- `feat(git_log): add --follow renames output flag`
- `docs(config): GIT_BASE_DIR interaction with session working dir is unclear`
- `perf(cli-provider): spawn overhead dominates short git_status calls`

### Labels

| Label         | When                                                               |
| :------------ | :----------------------------------------------------------------- |
| `bug`         | Something broken                                                   |
| `enhancement` | New feature or improvement                                         |
| `docs`        | Documentation issue                                                |
| `config`      | Configuration or environment issue                                 |
| `regression`  | Worked before, broken after a change                               |
| `performance` | Slow path, memory issue                                            |
| `security`    | Security-relevant (path traversal, command injection, auth bypass) |

Combine labels: `--label "bug" --label "regression"`.

### Attaching logs or large output

```bash
bun run dev:stdio 2>&1 | head -200 > /tmp/git-mcp-error.log

# As part of a new issue
gh issue create \
  --title "bug(transport): stdio crashes on large diff payload" \
  --label "bug" \
  --body-file /tmp/git-mcp-error.log

# Or as a comment on an existing issue
gh issue comment <number> --body-file /tmp/git-mcp-error.log
```

For HTTP errors, capture the full JSON-RPC response (envelope + `result.content[]` or `error`) so the maintainer can see both the protocol frame and the tool error.

## Filing a Feature Request

Template below demonstrates the richer structure. Omit sections you don't need — simple requests don't require Flow / Design / Dependencies blocks.

````bash
gh issue create \
  --title "feat(git_log): add follow-renames flag" \
  --label "enhancement" \
  --body "$(cat <<'ISSUE'
`git_log` currently does not expose `--follow`, so callers cannot trace the full history of a renamed file without falling back to raw `git log`. This is a common workflow when reviewing long-lived code paths.

Related: #N

## Proposal

Add `followRenames: boolean` to the `git_log` input schema. When `true` and exactly one `pathspec` is provided, thread `--follow` into the underlying git invocation. Default `false` to preserve current behavior.

### Proposed behavior

```ts
// Input schema addition
followRenames: z
  .boolean()
  .default(false)
  .describe('Follow renames across the history. Requires exactly one pathspec.'),
```

Validation: if `followRenames: true` and `pathspec.length !== 1`, throw `McpError(INVALID_PARAMS)` with an actionable message.

### Scope

- `src/mcp-server/tools/definitions/git-log.tool.ts` — schema + logic
- `src/services/git/providers/cli/operations/commits/log.ts` — thread the flag into the `git log` argv
- README table entry for `git_log` updated if user-facing

### Out of scope

- Supporting `--follow` with zero or multiple pathspecs (git itself rejects it)
- Rewriting the output shape — same `GitLogResult` structure

### Alternatives considered

Auto-detect single-pathspec + enable `--follow` silently. Rejected: surprising default, and some callers deliberately want non-following history even with a single path.
ISSUE
)"
````

## Following Up

```bash
# View issue details
gh issue view <number>

# Add context
gh issue comment <number> --body "Additional findings..."

# List your open issues
gh issue list --author @me

# Close if resolved
gh issue close <number> --reason completed --comment "Fixed in <commit or PR>"
```

## Checklist

- [ ] Confirmed bug is in `git-mcp-server`, not an underlying git CLI issue
- [ ] Searched existing issues — no duplicate found
- [ ] All secrets, credentials, and tokens redacted (incl. git remote URLs)
- [ ] Issue filed with: version, runtime, transport, git provider, repro steps, actual vs expected behavior
