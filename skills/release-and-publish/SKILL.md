---
name: release-and-publish
description: >
  Ship a release end-to-end across every registry this project targets (npm, MCP Registry). Runs the final verification gate, pushes commits and tags, then publishes to each applicable destination. Assumes git wrapup (version bumps, changelog, commit, annotated tag) is already complete — this skill is the post-wrapup publish workflow. Halts and alerts the user on the first failure.
metadata:
  author: cyanheads
  version: '1.0'
  type: workflow
---

## Preconditions

This skill runs **after** git wrapup. By the time it's invoked:

- `package.json` version is bumped
- `server.json` version is bumped (top-level + each package entry)
- `CHANGELOG.md` has a new entry for this version with a concrete date (never `[Unreleased]`)
- README badges and version-bearing files are in sync
- Release commit (`chore: release v<version>`) exists
- Annotated tag (`v<version>`) exists locally
- Working tree is clean

If any are missing, halt and tell the user to finish wrapup first. Do not attempt to redo wrapup work from inside this skill.

## Failure Protocol

**Stop on the first non-zero exit.** No retries, no remediation from inside the skill. Report to the user:

1. Which step failed
2. The exact error output
3. Which destinations already received the release (npm published? tag pushed?) so they know the partial state

The user fixes locally and re-invokes, or runs the remaining steps manually. Publishes hard-fail with "version already exists" if replayed — that's the signal the step already succeeded.

## Steps

### 1. Sanity-check wrapup outputs

Read `package.json` → capture `version`. Read `server.json` → verify top-level `version` matches and every `packages[].version` matches. Then verify git state:

```bash
git status --porcelain                         # must be empty — clean working tree
git describe --exact-match --tags HEAD 2>&1    # must equal v<version>
git rev-parse --abbrev-ref HEAD                # note the branch name
```

If working tree is dirty, HEAD isn't on `v<version>`, or `server.json` versions drift from `package.json`, halt.

### 2. Run the verification gate

All three must succeed:

```bash
bun run devcheck
bun run rebuild
bun test
```

Any non-zero exit → halt with the failing command's output.

`devcheck` runs lint + format + typecheck + `bun audit`. `rebuild` is a clean + `bun build` to catch build-time regressions `devcheck` alone can miss.

### 3. Push to origin

```bash
git push
git push --tags
```

If the remote rejects either push, halt. On a fresh branch, `git push` may need `-u origin <branch>` — read the error and re-run if that's the only gap.

### 4. Publish to npm

```bash
bun publish --access public
```

`bun publish` uses whatever npm auth the user has configured in `~/.npmrc`. If 2FA is enabled on the npm account, the command will prompt for an OTP or open a browser — that's expected; the user completes it interactively.

**Friction reducers (optional, configure once):**

| Option                                                                                           | How                                                                               |
| :----------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| **npm granular access token** with "Bypass 2FA for publish"                                      | Generate at npmjs.com → replace `_authToken` in `~/.npmrc` → no OTP prompt at all |
| **1Password CLI TOTP injection** (requires `brew install --cask 1password-cli` + signed-in `op`) | `bun publish --access public --otp="$(op item get 'npm' --otp)"`                  |

Halt on publish error other than "version already exists" (which means this step already ran).

### 5. Publish to MCP Registry

```bash
bun run publish-mcp
```

This repo's `publish-mcp` script is defined in `package.json` and runs `scripts/validate-mcp-publish-schema.ts` before invoking `mcp-publisher`. Reads `server.json` at the repo root.

Prereqs:

- A GitHub PAT with `read:org` + `read:user` scopes, reachable by the `publish-mcp` script (conventionally stored in Keychain under service `mcp-publisher-github-pat` on macOS)
- `mcp-publisher` CLI installed (`npm i -g mcp-publisher` or `brew install mcp-publisher`)

If the Keychain entry doesn't exist:

```bash
security add-generic-password -a "$USER" -s mcp-publisher-github-pat -w
# paste PAT at the silent prompt
```

Halt on any publisher error other than "cannot publish duplicate version".

### 6. Report the deployed artifacts

Print clickable URLs for every destination that succeeded:

- **npm:** `https://www.npmjs.com/package/@cyanheads/git-mcp-server/v/<version>`
- **MCP Registry:** `https://registry.modelcontextprotocol.io/v0/servers?search=io.github.cyanheads/git-mcp-server`
- **GitHub release tag:** `https://github.com/cyanheads/git-mcp-server/releases/tag/v<version>`

Skip any destination that was skipped or failed in its step.

## Optional: Create a GitHub Release

The annotated tag is enough for npm/MCP Registry. A GitHub Release adds a human-readable changelog page and optional assets. Skip unless the project publishes releases to GitHub Releases specifically.

```bash
gh release create "v<version>" \
  --title "v<version>" \
  --notes-file <(awk "/^## v<version>/,/^## v/" CHANGELOG.md | sed '$d')
```

The `awk` expression extracts just the current version's section from `CHANGELOG.md`.

## Checklist

- [ ] Working tree clean; HEAD tagged `v<version>`
- [ ] `package.json` and `server.json` versions match
- [ ] `bun run devcheck` passes
- [ ] `bun run rebuild` succeeds
- [ ] `bun test` passes
- [ ] `git push` succeeds
- [ ] `git push --tags` succeeds
- [ ] `bun publish --access public` succeeds
- [ ] `bun run publish-mcp` succeeds
- [ ] Deployed artifact URLs reported to the user
