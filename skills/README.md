# Skills

Agent Skills for `@cyanheads/git-mcp-server`. Each subdirectory contains a `SKILL.md` following the [Agent Skills specification](https://agentskills.io/specification).

## Distribution

`skills/` at the project root is the **source of truth**. Agents sync their working copy from here:

| Agent       | Directory           |
| :---------- | :------------------ |
| Claude Code | `.claude/skills/`   |
| Codex       | `.codex/skills/`    |
| Cursor      | `.cursor/skills/`   |
| Windsurf    | `.windsurf/skills/` |

Sync with:

```bash
mkdir -p .claude/skills && cp -R skills/* .claude/skills/
```

Do not delete agent-directory skills that aren't in `skills/` — those may be general-purpose skills sourced elsewhere (e.g. `code-security`, `code-simplifier`, `writing-humanizer`).

## Available Skills

| Skill                 | Purpose                                                                  |
| :-------------------- | :----------------------------------------------------------------------- |
| `maintenance`         | Investigate, adopt, and verify dependency updates after `bun update`     |
| `field-test`          | Exercise tools/resources/prompts via live HTTP server using MCP JSON-RPC |
| `report-issue`        | File bugs or feature requests against this repo using `gh`               |
| `release-and-publish` | Ship releases across npm, MCP Registry, and GHCR after git wrapup        |
| `polish-docs-meta`    | Finalize README, metadata, and agent protocol for a ship-ready server    |
