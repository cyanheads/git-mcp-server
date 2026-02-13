# Changelog

All notable changes to this project will be documented in this file.

## v2.7.0 - 2026-02-12

### Added

- **CI workflow**: Added GitHub Actions CI pipeline with lint, typecheck, and test steps on push/PR to main
- **Comprehensive unit test suite**: Added 41 new test files covering all tool definitions, service layer operations, prompts, resources, auth middleware, and shared utilities
- **Bun test runner compatibility**: Added Vitest compatibility shims in test setup for `vi.mock`, fake timers, and pre-mocked modules

### Changed

- **Removed roots, elicitation, and sampling capabilities** from MCP server registration; simplified server to logging, resources, tools, and prompts
- **Removed `ElicitableContext`** and elicitation bridging logic from tool handler factory, simplifying `appContext` creation
- **Deleted `roots-registration.ts`** module and its import/usage in server setup
- **Modernized publish workflow**: Added Bun setup, upgraded Node.js 18→22, migrated install/build/test steps from npm to Bun, added lint and typecheck gates
- **Rewrote CLAUDE.md** (v2.4.1 → v2.5.0): consolidated agent protocol docs, updated tool workflow to use `createToolHandler` pattern, reformatted tables
- **Deleted `.clinerules/clinerules.md`**: obsolete hard-linked copy replaced by AGENTS.md symlink
- **Updated `docs/tree.md`** to reflect removal of roots directory
- **Updated server.json**: bumped schema to 2025-12-11, removed deprecated `mcpName` field

### Fixed

- **Wrapup tool module init**: Added defensive null check (`config?.git?.wrapupInstructionsPath`) to prevent crash when config is undefined during test or early initialization
- **Logger integration tests**: Replaced brittle `setTimeout` waits with deterministic `waitForLogEntry`/`waitForFile` polling helpers

### Improved

- **Test type safety**: Added explicit `ExecGitFn` type for mock functions and non-null assertions on mock call access in checkout, diff, and log tests
- **Test runner config**: Added sequential execution (`maxWorkers: 1`) and fake timer configuration to vitest.config.ts
- **Clean script**: Added `coverage` to default clean directories

### Dependencies

- Bumped `@modelcontextprotocol/sdk` from ^1.24.3 to ^1.26.0
- Bumped `eslint` from ^9.39.2 to ^10.0.0 and `@eslint/js` from ^9.39.2 to ^10.0.1
- Bumped `zod` from ^4.1.13 to ^4.3.6
- Bumped `hono` from ^4.10.8 to ^4.11.9 and `@hono/node-server` from ^1.19.7 to ^1.19.9
- Bumped `vitest` from ^4.0.15 to ^4.0.18 and `@vitest/coverage-v8` from 4.0.15 to 4.0.18
- Bumped `pino` from ^10.1.0 to ^10.3.1
- Bumped `typescript-eslint` from 8.49.0 to 8.55.0
- Bumped `vite` from 7.2.7 to 7.3.1 and `vite-tsconfig-paths` from ^5.1.4 to ^6.1.1
- Bumped `globals` from ^16.5.0 to ^17.3.0
- Updated numerous other dev dependencies to latest versions

## v2.6.5 - 2025-12-13

### Added

- **git_log stat/patch support**: Added `stat` and `patch` options to git_log tool for viewing file change statistics and full diff patches per commit
- **git_log skip support**: Added `skip` option for pagination of commit history
- **git_diff includeUntracked support**: Implemented full support for including untracked files in diff output using `git ls-files --others` and `git diff --no-index`
- **git_checkout track support**: Added `track` option for setting up branch tracking when creating branches

### Changed

- **Tool Option Mapping**: Refactored git_log and git_diff tools to use cleaner spread operator pattern for mapping tool interface to provider options
- **Diff Command Ordering**: Corrected flag ordering in diff operations to place flags before commits/paths per git convention

### Fixed

- **git_diff nameOnly mode**: Fixed nameOnly output to properly count and return file list including untracked files
- **git_diff stat mode**: Fixed stat-only mode to return complete diffstat output

### Dependencies

- Updated `@cloudflare/workers-types` from 4.20251212.0 to 4.20251213.0
- Updated `@eslint/js` from 9.39.1 to 9.39.2
- Updated `clipboardy` from 5.0.1 to 5.0.2
- Updated `eslint` from 9.39.1 to 9.39.2
- Updated `repomix` from 1.10.0 to 1.10.1

## v2.6.4 - 2025-12-12

### Fixed

- **Build Artifact Version Mismatch**: Rebuilt dist to embed correct version. v2.6.3 was published with stale build artifacts containing v2.6.2 version string.

## v2.6.3 - 2025-12-12

### Fixed

- **Windows Git Executable Resolution**: Fixed `ENOENT` error when spawning git commands on Windows. Node.js `child_process.spawn()` doesn't search PATH like cmd.exe does. Replaced with `cross-spawn` package for proper Windows PATH resolution. Fixes [#37](https://github.com/cyanheads/git-mcp-server/issues/37).

### Changed

- **Runtime Adapter**: Updated Node.js spawn implementation to use `cross-spawn` for cross-platform compatibility while maintaining array-based argument passing for security

### Added

- **Runtime Adapter Tests**: Added unit tests for `detectRuntime()` and `spawnGitCommand()` covering runtime detection, git command execution, timeout handling, and abort signal cancellation
- **Command Builder Tests**: Added unit tests for `buildGitEnv()`, `buildGitCommand()`, `validateGitArgs()`, and `escapeShellArg()` covering PATH preservation, git-specific environment variables, null byte rejection, and shell metacharacter safety

## v2.6.2 - 2025-12-12

### Fixed

- **JSON Schema Compatibility**: Changed numeric schema validators from `.positive()` to `.min(1)` for Draft 4 compatibility. Go clients using Draft 4 JSON Schema parsers failed when `exclusiveMinimum` was a number (Draft 7 format) instead of a boolean (Draft 4 format). Using `.min(1)` outputs `minimum: 1` which works across all JSON Schema drafts. Fixes [#34](https://github.com/cyanheads/git-mcp-server/issues/34).
  - Updated `LimitSchema` and `DepthSchema` in common schemas
  - Updated `mainline` parameter in `git_cherry_pick` tool

### Added

- **Schema Compatibility Tests**: Added comprehensive test suite (`tests/mcp-server/tools/schemas/common.test.ts`) validating JSON Schema output for Draft 4 compatibility across all numeric constraints

## v2.6.1 - 2025-12-12

### Fixed

- **Cross-Platform Path Validation**: Replaced Unix-specific `/` prefix check with `path.isAbsolute()` for proper Windows and POSIX path handling in `GIT_BASE_DIR` validation. Fixes [#36](https://github.com/cyanheads/git-mcp-server/issues/36).
- **Path Sanitization**: Fixed absolute path handling when a rootDir is specified - paths within rootDir are now correctly validated instead of being rejected. Related to [#36](https://github.com/cyanheads/git-mcp-server/issues/36).

### Security

- **Enhanced Path Traversal Detection**: Improved path normalization in sanitization logic to consistently compare normalized paths, preventing bypass attempts via redundant slashes or dot segments

### Added

- **Path Sanitization Tests**: Added comprehensive test suite covering absolute paths within/outside rootDir, nested paths, redundant slashes, dot segments, and path traversal scenarios

## v2.6.0 - 2025-12-12

### Changed

- **MCP SDK 1.24.x Upgrade**: Upgraded to MCP SDK 1.24.3 with breaking API changes:
  - Updated tool handler signatures to use new SDK types (`ServerRequest`, `ServerNotification`)
  - Changed resource registration to use `title` property instead of `name`
  - Updated tool registration to pass schemas directly instead of `.shape`
  - Removed deprecated `description` property from server configuration
- **Zod 4.x Migration**: Upgraded from Zod 3.x to 4.x:
  - Updated `z.record(z.any())` to `z.record(z.string(), z.any())` in git-add, git-commit, and git-show tools
  - All tool schemas now compatible with Zod 4.x strict typing
- **MCP Spec Compliance**: Updated spec version reference from 2025-06-18 to 2025-11-25
- **Runtime Recommendation**: Changed primary recommendation from Bun to Node.js for end users:
  - Documentation now recommends `npx` as the primary installation method
  - `bunx` remains available as an alternative
  - Development commands updated from `bun` to `npm run`
- **Documentation**: Simplified prerequisites and streamlined installation instructions

### Fixed

- **Import Order**: Added critical comment noting `reflect-metadata` must be imported before any module using tsyringe

### Dependencies

- Updated MCP SDK from 1.20.2 to 1.24.3
- Updated Zod from 3.23.8 to 4.1.13
- Updated Hono from 4.10.3 to 4.10.8
- Updated @hono/mcp from 0.1.4 to 0.2.2
- Updated @hono/node-server from 1.19.5 to 1.19.7
- Updated OpenTelemetry packages from 0.207.x to 0.208.x
- Updated TypeScript-ESLint from 8.46.2 to 8.49.0
- Updated Vitest from 4.0.4 to 4.0.15
- Updated numerous other dependencies to latest versions

## v2.5.8 - 2025-10-27

### Changed

- **Dependency Updates**: Updated several core dependencies to their latest versions for improved security and performance:
  - Updated `axios` from 1.12.2 to 1.13.0
  - Updated `hono` from 4.9.12 to 4.10.3
  - Updated `validator` from 13.15.15 to 13.15.20
  - Updated `@types/validator` from 13.15.3 to 13.15.4
  - Updated `vitest` and related testing packages from 4.0.3 to 4.0.4

## v2.5.7 - 2025-10-24

### Changed

- **API Refinement**: Renamed `includeContext` parameter to `includeMetadata` in `git_set_working_dir` tool for better clarity. Changed default from `true` to `false` to minimize response size and improve performance. The metadata (status, branches, remotes, recent commits) is now opt-in rather than opt-out.

### Improved

- **Tool Descriptions**: Enhanced `git_commit` tool description with explicit examples showing proper JSON string formatting for single-line and multi-line commit messages.
- **Code Formatting**: Improved readability of conditional statements in logger error handlers with better line breaks.

## v2.5.6 - 2025-10-24

### Fixed

- **Critical: Worker Thread Crashes**: Externalized `pino` and `pino-pretty` from the bundle to fix ThreadStream worker exit errors. Pino's worker threads require actual files on disk, which fail when bundled. This resolves the immediate crash on startup reported in [#27](https://github.com/cyanheads/git-mcp-server/issues/27).
  - Added `--external pino --external pino-pretty` to build command
  - Reduced bundle size from 7.30 MB to 7.18 MB (1992 vs 2021 modules)
  - Logger now loads from node_modules at runtime instead of being embedded

## v2.5.5 - 2025-10-24

> **Note**: Version 2.5.4 was published but I messed up the changelog somehow. Skipped to avoid conflicts. This release supersedes 2.5.4.

## v2.5.4 - 2025-10-24

### Fixed

- **Console Output in Non-TTY Environments**: Enhanced logging to prevent ANSI codes and debug output from polluting non-TTY environments, especially STDIO mode. Added TTY checks (`process.stderr?.isTTY`) throughout logging infrastructure to ensure clean JSON-RPC output.
  - JSON response formatter now checks TTY before debug logging
  - Tool handler factory validates SDK context only when TTY available
  - Logger startup messages conditional on TTY to avoid stderr pollution
  - Startup banner uses stderr in STDIO mode (stdout reserved for MCP JSON-RPC)

### Changed

- **Dependencies**: Moved `pino` and `pino-pretty` from devDependencies to regular dependencies for better production deployment
- **Dependency Updates**:
  - Updated OpenTelemetry packages from 0.206.x to 0.207.x
  - Updated MCP SDK from 1.20.0 to 1.20.2
  - Updated ESLint and TypeScript-ESLint packages (9.37.0 → 9.38.0, 8.46.0 → 8.46.2)
  - Updated Vitest from 3.2.4 to 4.0.3
  - Updated Hono from 4.9.12 to 4.10.3
  - Updated Vite from 7.1.9 to 7.1.12
  - Various other package updates (MSW, OpenAI, Repomix, etc.)

### Technical Details

- The STDIO transport requires pristine stdout for MCP JSON-RPC protocol compliance
- All startup banners, debug output, and logs now respect TTY detection
- In STDIO mode, banners and errors use stderr; HTTP mode continues to use stdout
- Enhanced test coverage to verify transport-specific logging behavior

## v2.5.3 - 2025-10-15

### Fixed

- **Critical: STDIO Logging to stderr**: Fixed logger to route all log output to stderr (fd 2) instead of stdout (fd 1) when using STDIO transport. The MCP specification mandates that stdout must contain ONLY JSON-RPC messages. Previously, logs were incorrectly sent to stdout, which could interfere with MCP client parsing.
  - Changed `pino/file` destination from `1` (stdout) to `2` (stderr) for STDIO and production modes
  - Enhanced test coverage to verify stderr routing and validate ANSI code removal
  - Added comprehensive documentation explaining the MCP specification requirement

### Technical Details

- The MCP specification requires strict stdout hygiene - only JSON-RPC protocol messages allowed
- Logs were already in plain JSON format (no ANSI codes) as of v2.5.2, but routing to stdout still violated spec
- Solution: Updated logger transport configuration to use stderr (fd 2) for all non-development STDIO scenarios
- This ensures MCP clients can reliably parse stdout as pure JSON-RPC without encountering log messages

### Changed

- **Documentation**: Updated test comments to clarify that file-based testing verifies format while stderr routing is enforced by implementation

## v2.5.2 - 2025-10-15

### Fixed

- **STDIO Transport Logging Compliance**: Fixed logger to prevent ANSI color codes from appearing in stdout when using STDIO transport. The MCP specification requires clean JSON-RPC output with no formatting escape sequences. Logger now accepts transport type during initialization and forces plain JSON output for STDIO mode while preserving colored output for HTTP mode in development.
  - Added `transportType` parameter to `logger.initialize()`
  - STDIO mode now bypasses `pino-pretty` and outputs raw JSON
  - HTTP mode continues to use colored output in development for better developer experience
  - Added comprehensive test coverage validating ANSI code removal in STDIO logs

### Technical Details

- The root cause was that the logger used `pino-pretty` for all development environments, which adds ANSI escape codes for colorized output
- MCP clients parse stdout as JSON-RPC and fail when encountering non-JSON content
- Solution: Pass `config.mcpTransportType` to logger during initialization to conditionally enable pretty output

## v2.5.1 - 2025-10-15

### Fixed

- **Critical: Dependency Resolution Issues with `bunx`/`npx`**: Resolved Cursor MCP client connection failures caused by Bun's `EEXIST` linking errors during dependency installation. The root cause was that all dependencies were listed as runtime dependencies despite being bundled into the single-file output by `bun build`.
  - **Solution**: Moved all dependencies to `devDependencies` since they are already bundled into `dist/index.js` (7.2MB single-file bundle)
  - **Impact**: Package now installs in ~20ms with **zero runtime dependencies**, eliminating all dependency linking conflicts
  - **Benefit**: MCP clients using `bunx` or `npx` can now reliably execute the server without installation failures

### Technical Details

- The build process (`bun build --target node`) creates a self-contained bundle with all code inlined
- Published package now contains only: `dist/index.js`, `package.json`, `README.md`, `LICENSE`
- Package size reduced from requiring 30+ dependency installations to single-file execution
- No changes to functionality - all features work identically

## v2.5.0 - 2025-10-13

### Added

- **MCP Spec 2025-06-18 Compliance Enhancements**:
  - **Protocol Version Validation**: Server now properly validates `MCP-Protocol-Version` header and returns HTTP 400 Bad Request for unsupported protocol versions (per MCP spec requirement). Previously only logged a warning.
  - **Session Management**: Implemented comprehensive HTTP session lifecycle management per MCP specification:
    - New `SessionManager` service tracks session creation, activity, and expiry
    - Sessions automatically expire after configurable timeout (`MCP_STATEFUL_SESSION_STALE_TIMEOUT_MS`)
    - Background cleanup removes stale sessions periodically
    - Server returns HTTP 404 when session expires, signaling clients to reinitialize
    - DELETE endpoint for explicit client-initiated session termination
  - **Cancellation Support**: Wired up `AbortSignal` throughout the git operation stack for proper request cancellation:
    - Git CLI executor now accepts and respects `AbortSignal` from MCP SDK
    - Both Bun and Node.js runtime adapters kill child processes on abort
    - Long-running operations (clone, fetch, push, pull) can be cancelled mid-execution
    - Resources cleaned up properly on cancellation

### Changed

- **HTTP Transport**: Enhanced `httpTransport.ts` with session validation and lifecycle management
- **Git Runtime Adapter**: Updated `runtime-adapter.ts` to support cancellation in both Bun and Node.js spawning paths
- **Session Lifecycle**: HTTP transport now stops session cleanup interval during graceful shutdown

### Technical Debt Reduced

- Eliminated potential memory leak from never-expiring sessions
- Improved cancellation story for long-running git operations
- Better alignment with MCP specification recommendations

## v2.4.9 - 2025-10-13

### Added

- **Configurable Git Identity**: Introduced support for setting Git author and committer information via environment variables (e.g., `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`). The server now automatically uses these values, with a fallback to the user's global Git configuration if they are not set. This allows for consistent identity management across all Git operations.
- **Expanded Commit Signing**: Extended GPG/SSH signing capabilities to all commit-creating operations. Signing can now be enabled for `git merge`, `git rebase`, `git cherry-pick`, and `git tag` in addition to `git commit`.

### Changed

- **Internal Refactor**: Centralized the logic for handling Git identity and commit signing within the command builder (`command-builder.ts`) and a new configuration helper (`config-helper.ts`). This ensures that all Git operations consistently use the configured identity and signing settings.
- **Documentation**: Updated `README.md` and `.env.example` to provide clear documentation and examples for the new Git identity and expanded signing features.
- **Version**: Bumped the package version to `2.4.9`.

## v2.4.8 - 2025-10-13

### Fixed

- **Package Scripts**: Reorganized `package.json` scripts section to match template structure, fixing stdio transport connection issues. Removed comment separators that could interfere with script execution and reordered scripts in the proper sequence (build → deploy → start → dev). Added missing `rebuild` script.
- **Transport Detection**: Resolved issue where MCP clients (like Cursor) would show red connection indicator despite successful tool/resource registration when using stdio transport.

### Changed

- **Script Organization**: Scripts now follow consistent ordering pattern matching the mcp-ts-template for better maintainability and cross-project consistency.

## v2.4.7 - 2025-10-13

### Added

- **Cross-Runtime Compatibility**: The server now officially supports both **Bun** and **Node.js** runtimes. A new runtime detection mechanism (`src/utils/internal/runtime.ts`) and a runtime adapter for Git command execution (`src/services/git/providers/cli/utils/runtime-adapter.ts`) have been added. This ensures optimal performance by using `Bun.spawn` in the Bun runtime and `child_process.spawn` in the Node.js runtime.
- **Runtime Logging**: The server now logs the detected runtime environment on startup for easier debugging and support.

### Changed

- **Documentation**: Updated `README.md` to reflect the new cross-runtime compatibility, providing clear instructions and configuration examples for both `bunx` and `npx`.
- **Dependencies**: Updated several dependencies to their latest versions, including `hono`, `repomix`, and `vite`.

## v2.4.6 - 2025-10-11

### Changed

- **Documentation**: Polished the `README.md` to improve clarity and consistency across the "Tools," "Resources," and "Prompts" sections.
- **Configuration**: Refined the `package.json` file by organizing scripts into logical groups, alphabetizing keywords, and simplifying the project description for better readability.

## v2.4.5 - 2025-10-11

### Added

- **Tilde Expansion Support**: Configuration now supports tilde (`~`) expansion in path environment variables for improved developer experience. Applies to `LOGS_DIR`, `STORAGE_FILESYSTEM_PATH`, `GIT_WRAPUP_INSTRUCTIONS_PATH`, and `GIT_BASE_DIR`. Supports both `~/path` (expands to `homedir/path`) and `~` alone (expands to `homedir`).
- **Enhanced Git Branch Filtering**: The `git_branch` tool now accepts commit references for `merged` and `noMerged` parameters. Users can specify a commit hash or branch name to filter branches (e.g., `merged: "main"` shows branches merged into main, not just HEAD).
- **Shared Formatter Utility**: Extracted duplicate `flattenChanges` helper function into shared utility module (`git-formatters.ts`) for better code reuse across git tools.

### Fixed

- **Documentation Typo**: Corrected agent meta files reference in `git_wrapup_instructions` tool from `.clinerules` to `.cline_rules`.

### Changed

- **Version Bump**: Updated version from 2.4.4 to 2.4.5 in package.json and README.md.
- **Code Refactoring**: Consolidated duplicate change flattening logic from `git_add` and `git_commit` tools into the shared `flattenChanges` utility, improving maintainability.
- **Documentation**: Updated tree.md to reflect addition of `git-formatters.ts` utility.
- **README Examples**: Enhanced README with more comprehensive configuration examples including git username, email, base directory, and logs directory settings.

## v2.4.4 - 2025-10-11

### Added

- **Enhanced Repository Context**: The `git_set_working_dir` tool now provides rich repository context by default when setting the working directory. Includes immediate status, branch information, configured remotes, and recent commits. Context gathering can be disabled via the new `includeContext` parameter.
- **Base Directory Security**: New optional `GIT_BASE_DIR` environment variable to restrict all git operations to a specific directory tree. Provides security sandboxing for multi-tenant or shared hosting environments. When configured, prevents git operations from accessing paths outside the specified base directory.

### Changed

- **Configuration**: Updated default HTTP port from 3010 to 3015 across all configuration files (`.env.example`, `src/config/index.ts`, `smithery.yaml`, tests).
- **Documentation**: Enhanced response format documentation in README with comprehensive examples showing both JSON (LLM-optimized) and Markdown (human-readable) output formats. Added detailed explanation of verbosity levels and when to use each format.
- **Documentation**: Clarified tool count (now 27 with addition of `git_clear_working_dir`) and updated Advanced Workflows category to reflect both `git_set_working_dir` and `git_clear_working_dir` tools.
- **Documentation**: Added comprehensive Roadmap section detailing provider-based architecture and planned git provider integrations (CLI via Bun.spawn, isomorphic-git, GitHub API). Includes technical details about current CLI provider implementation (streaming I/O, timeout handling, buffer limits).
- **Documentation**: Enhanced Features section to highlight provider-based architecture and optimized git execution via Bun.spawn with streaming I/O and timeout handling.
- **Branding**: Updated project references from `mcp-ts-template` to `git-mcp-server` in configuration files (`typedoc.json`, `smithery.yaml`, `wrangler.toml`).

### Fixed

- **Import Order**: Corrected import organization in `git-set-working-dir.tool.ts` to follow project conventions (framework imports first, internal imports second).
- **Config Import**: Fixed config import in `git-validators.ts` to use named export pattern with proper TypeScript typing for optional GIT_BASE_DIR value. Added defensive null-safety checks to handle undefined config in test environments.

## v2.4.3 - 2025-10-11

### Fixed

- **Git Branch Tool**: Fixed `git for-each-ref` command construction by correctly placing the command in the `command` parameter instead of args array
- **Git Rebase Tool**: Enhanced `--continue` mode with fallback handling for `--no-edit` option, improving compatibility across different Git versions
- **Git Command Builder**: Fixed environment variable construction to preserve PATH from process.env, ensuring git executable can be found in custom install locations

### Changed

- **Documentation**: Updated tree.md to reflect addition of CLAUDE.md file

## v2.4.2 - 2025-10-10

### Added

- **JSON Response Formatter**: Introduced a new `json-response-formatter` utility (`src/mcp-server/tools/utils/json-response-formatter.ts`) to create LLM-optimized, structured JSON responses for tools. This improves parsing efficiency and reduces token usage compared to Markdown. The formatter supports configurable verbosity levels (`minimal`, `standard`, `full`).

### Changed

- **Tool Architecture**: Refactored all Git tools to align with the new v2.4.0 architecture. All `responseFormatter` implementations now use the new `createJsonFormatter`, and Git command execution is consistently delegated to the `GitProvider` service layer.
- **Test Suite**: Updated the entire test suite to reflect the architectural changes. Test helpers, assertions, and unit tests have been modified to validate structured JSON output instead of Markdown.
- **Configuration**: The `.env.example` file has been updated to include the new `MCP_RESPONSE_VERBOSITY` configuration option.
- **Logging**: The logger (`src/utils/internal/logger.ts`) has been enhanced to include a `notice` level and an improved startup banner.

### Dependencies

- Updated `package.json` and `bun.lock` with the latest versions of project dependencies.

## v2.4.1 - 2025-10-11

### Added

- **Markdown Builder Utility**: Added a fluent interface markdown builder (`src/mcp-server/tools/utils/markdown-builder.ts`) for constructing LLM-optimized response formatters. Provides chainable methods for headings, sections, lists, key-value pairs, and conditional content. Improves consistency and maintainability across all tool response formatters.
- **SDK Context Validation**: Added defensive type guard (`validateSdkContext`) in tool handler factory to validate MCP SDK context structure, catching unexpected issues early and improving robustness.

### Changed

- **Tool Response Formatters**: Refactored `git_add` and `git_commit` response formatters to use the new markdown builder utility, resulting in cleaner, more maintainable code with consistent formatting.
- **Enhanced Tool Output**:
  - `git_add` tool now includes comprehensive repository status after staging, showing all staged changes, remaining unstaged changes, untracked files, and whether the repository is ready to commit.
  - `git_commit` tool response formatter refactored for improved readability and structure using markdown builder.
- **Tool Handler Improvements**:
  - Enhanced dependency injection with closure-based memoization for thread-safe singleton pattern.
  - Added debug mode logging for tool inputs (enabled via `MCP_DEBUG_TOOL_INPUTS=true`).
  - Improved error context logging with more detailed information about failures.
  - Better path resolution with runtime type safety checks and comprehensive logging.
  - Added graceful fallback when path property is unexpectedly missing from tool input.

### Fixed

- **Tool Handler Type Safety**: Improved runtime type checking for tool inputs with path properties, preventing potential type mismatches during working directory resolution.

### Documentation

- **README**: Enhanced formatting and improved documentation structure for prompts and tool responses sections.
- **CHANGELOG**: Consolidated alpha release notes into cohesive v2.4.0 release notes.

### Dependencies

- Updated `@cloudflare/workers-types` to `^4.20251011.0`
- Updated `@types/bun` to `^1.3.0`
- Updated `bun-types` to `^1.3.0`
- Removed unused transitive dependencies from lock file

## v2.4.0 - 2025-10-10

- Aligned with [mcp-ts-template](https://github.com/cyanheads/mcp-ts-template) v2.3.5
- Moved to [Bun](https://bun.sh) for dependency management, scripting, and runtime execution.
- Major architectural refactor to a dual-output tool architecture with structured content and User-optimized responses.

### New Features

- **Git Wrapup Prompt** (`git_wrapup`): A new structured workflow prompt for completing git sessions. Guides users through a systematic protocol including reviewing changes with `git_diff`, updating changelog and documentation, creating logical commits, and optionally creating release tags. Features configurable options for skipping documentation review, creating tags, and updating agent meta files. Integrates with the `git_wrapup_instructions` tool for context-aware workflow generation.
- **Git Blame Tool** (`git_blame`): Show line-by-line authorship information for files, displaying who last modified each line and when. Supports optional line range filtering (`startLine`, `endLine`), whitespace change ignoring, and provides formatted output with commit hash, date, author, and content for each line.
- **Git Reflog Tool** (`git_reflog`): View reference logs (reflog) to track when branch tips and other references were updated. Essential for recovering lost commits and understanding repository history. Supports filtering by specific references (default: HEAD) and configurable entry limits. Output includes chronological history of all git operations.

### Added

- **Dual-Output Tool Architecture**: All tools now implement a sophisticated dual-output system that provides different perspectives of the same operation:
  - **Structured Content** (`outputSchema`): Type-safe Zod schemas define the complete, machine-readable data structure returned by tool logic. This is the "source of truth" containing all operational details.
  - **Response Formatter** (`responseFormatter`): Transforms structured output into LLM-optimized `ContentBlock[]` arrays. These formatted responses balance human-readable summaries with complete data, ensuring LLMs have full context to answer follow-up questions. Supports markdown formatting, hierarchical organization, and intelligent truncation.
  - **Key Benefit**: Clients can access raw structured data for processing while LLMs receive optimized, contextual narratives—all from a single tool invocation.
- **Architectural Foundation**:
  - **Dependency Injection**: Integrated `tsyringe` for robust dependency injection, decoupling services and tools. A central DI `container` now manages object lifetimes.
  - **Service/Provider Pattern**: Introduced a standardized service and provider pattern (`src/services/`, `src/storage/`) for abstracting external integrations and data persistence.
  - **Declarative Definitions**: Resources and tools are now self-contained, declarative `ToolDefinition` and `ResourceDefinition` objects in `src/mcp-server/tools/definitions/` and `src/mcp-server/resources/definitions/`, respectively. This simplifies registration and improves modularity.
- **Core Utilities**:
  - **Observability**: Added `performance` and `telemetry` utilities for tracing and metrics, including `measureToolExecution` for automatic performance tracking.
  - **Runtime Helpers**: New utilities for runtime detection (`isBun`, `isCloudflareWorker`) and startup banners.
  - **Health Checks**: A new internal health check utility for verifying service status.
- **Authorization**: Implemented `withToolAuth` and `withResourceAuth` wrapper functions to apply scope-based authorization declaratively to tools and resources.
- **Build & Development**:
  - **Bun**: Fully migrated to `bun` for dependency management, scripting, and runtime execution, replacing `npm` and `tsx`.
  - **Devcheck Script**: Added a new `devcheck` script (`scripts/devcheck.ts`) for comprehensive quality checks (lint, format, typecheck, audit).

### Changed

- **Major Architectural Refactor**: The entire server has been overhauled to align with the `mcp-ts-template v2.3.5` architecture. This is a breaking change for the internal structure but maintains external API compatibility.
  - **File Structure**: Massively reorganized the `src` directory to enforce a strict separation of concerns, with new top-level directories for `container`, `services`, `storage`, and `mcp-server`.
  - **Tool Registration**: The previous registration system (`registration.ts` files) has been replaced by a barrel export (`index.ts`) in the `definitions` directories, which is automatically consumed by the DI container.
  - **Configuration**: Enhanced `src/config/index.ts` with more detailed Zod validation and runtime-specific configurations.
  - **Transports**: Refactored transport management (`src/mcp-server/transports/`) with a unified `TransportManager` and a clear `ITransport` interface.
- **Error Handling**: Centralized error handling logic into `src/utils/internal/error-handler/`, improving consistency.

### Removed

- **Legacy Tool Structure**: Deleted the entire old tool directory structure (`src/mcp-server/tools/[toolName]/{index.ts, logic.ts, registration.ts}`). All tools were rewritten as declarative definitions.
- **Legacy Resource Structure**: Deleted the old resource directory structure for `gitWorkingDir`.
- **Legacy Transport Core**: Removed outdated transport management files from `src/mcp-server/transports/core/`.
- **Build & Config Files**: Removed `package-lock.json`, `.ncurc.json`, `Dockerfile`, and `tsconfig.typedoc.json`, which are no longer needed with the `bun`-based workflow.

## v2.3.5 - 2025-09-29

### Changed

- **Tooling**:
  - The `git_commit` tool now correctly handles cases where there are no changes to commit, returning a `nothingToCommit: true` status instead of throwing an error.
  - The `git_status` tool's schema is now more flexible (`.passthrough()`) to prevent validation errors on encountering unexpected Git status identifiers.
- **Dependencies**: Updated various dependencies, including `@hono/node-server`, `@types/node`, `typescript-eslint`, and `typescript`.
- **CI/CD**: Minor formatting adjustments in the `publish.yml` GitHub Actions workflow.

### Removed

- **Legacy Files**: Deleted `mcp.json`, `docs/publishing-mcp-server-registry.md`, and `scripts/validate-mcp-publish-schema.ts`, which were part of an outdated publishing workflow.

## v2.3.4 - 2025-09-26

### Removed

- **Publishing**: Removed the manual publishing script (`scripts/validate-mcp-publish-schema.ts`) and associated documentation (`docs/publishing-mcp-server-registry.md`). The `mcp.json` file, related to the old workflow, has also been deleted. This streamlines the publishing process.

### Added

- **Custom Instructions**: The `git_wrapup_instructions` tool can now load custom instructions from an external Markdown file. The file path can be specified using the `GIT_WRAPUP_INSTRUCTIONS_PATH` environment variable.

### Changed

- **Instructions**: Enhanced the default `git_wrapup_instructions` to be more authoritative and include an example task list.
- **Dependencies**: Updated various dependencies to their latest versions, including `@modelcontextprotocol/sdk`, `openai`, `tsx`, and `typescript-eslint`.

## v2.3.3 - 2025-09-15

### Added

- **Documentation**: New guide on "How to Publish Your MCP Server" (`docs/publishing-mcp-server-registry.md`) including an all-in-one `publish-mcp` script.
- **Scripts**: Added `scripts/validate-mcp-publish-schema.ts` to automate version syncing, schema validation, and publishing workflow for MCP servers.

### Changed

- **Build & Configuration**:
  - Updated `.gitignore` with new categories and ignore patterns for `.vscode/`, `.history/`, `build/`, `dist/`, `out/`, `logs/`, `data/`, generated documentation, environment files, and MCP registry related files.
  - Added `mcpName` field to `package.json` for MCP registry identification.
  - `server.json` updated with new `mcpName` and version.
- **Dependencies**:
  - Updated `@modelcontextprotocol/sdk` to `^1.18.0`.
  - Updated `axios` to `^1.12.2`.
  - Updated `jose` to `^6.1.0`.
  - Updated `openai` to `^5.20.2`.
  - Updated `tiktoken` to `^1.0.22`.
  - Updated `@eslint/js` to `^9.35.0`.
  - Updated `@types/node` to `^24.4.0`.
  - Updated `@types/validator` to `13.15.3`.
  - Added `ajv` and `ajv-formats` as devDependencies.
  - Updated `eslint` to `^9.35.0`.
  - Updated `globals` to `^16.4.0`.
  - Updated `msw` to `^2.11.2`.
  - Updated `tsx` to `^4.20.5`.
  - Updated `typedoc` to `^0.28.13`.
  - Updated `typescript-eslint` to `^8.43.0`.
- **Code Improvement**:
  - Modified `src/utils/metrics/tokenCounter.ts` to explicitly check `tool_call.type === "function"` before accessing function-specific properties; improves robustness for different tool call types.

## v2.3.2 - 2025-07-31

### Feature

- **Enhanced Tool Feedback**: Implemented an enhancement across multiple core Git tools to provide immediate, contextual feedback on the repository's state. The following tools now include the complete, structured output of `git status` in their JSON response upon successful execution:
  - `git_add`
  - `git_checkout`
  - `git_cherry_pick`
  - `git_clean`
  - `git_commit`
  - `git_merge`
  - `git_pull`
  - `git_rebase`
  - `git_reset`
  - `git_stash`
    This change allows agents and clients to instantly verify the outcome of an operation without needing to make a subsequent call to `git_status`.

### Chore

- **Build & Configuration**:
  - **ESLint**: Updated `eslint.config.js` to add `coverage/`, `dist/`, `logs/`, and `data/` to the ignored paths, preventing linting of generated or irrelevant files.
  - **MCP Configuration**: Modified `mcp.json` to use `npx @cyanheads/git-mcp-server` as the execution command, simplifying server startup and removing the need for a local build.
- **Dependencies**:
  - Bumped the package version to `2.3.2` in `package.json` and `package-lock.json`.
- **Testing**:
  - Performed minor refactoring in `tests/utils/internal/errorHandler.test.ts` and `tests/utils/internal/logger.test.ts` to align with recent code modifications and improve test clarity.

## v2.3.1 - 2025-07-31

### Added

- **Testing**:
  - Added a comprehensive test suite covering authentication (`auth.test.ts`, `authUtils.test.ts`, `oauthStrategy.test.ts`), core utilities (`errorHandler.test.ts`, `logger.test.ts`, `requestContext.test.ts`), and transports (`stdioTransport.test.ts`).
  - Integrated `msw` for mocking API requests during tests.
  - Added `@vitest/coverage-v8` for generating code coverage reports.
- **CI/CD**:
  - Added `logs/` to `.gitignore` to prevent log files from being committed.

### Changed

- **Error Handling**:
  - Improved `ErrorHandler` to provide more specific and consistent error messages.
  - Enhanced `jwtStrategy.ts` and `oauthStrategy.ts` to re-throw structured `McpError`s, ensuring consistent error propagation.
- **Logging**:
  - Refactored the `Logger` class in `logger.ts` to be exportable and added a `resetForTesting` method to support isolated test runs.
  - Corrected the parameter order in a `logger.fatal` call within `httpTransport.ts` for better error reporting.
- **Dependencies**:
  - Updated `@modelcontextprotocol/sdk` to `^1.17.1`.
  - Updated various development dependencies to their latest versions.

### Fixed

- **Path Sanitization**: Improved path validation in `sanitization.ts` to explicitly disallow null bytes, enhancing security.
- **Git Log Parsing**: Corrected the field destructuring in `gitLog/logic.ts` to prevent potential errors when parsing commit bodies.

## v2.3.0 - 2025-07-31

### Added

- **Development Tooling**:
  - **`tsx`**: Replaced `ts-node` with `tsx` for significantly faster TypeScript execution in development, improving the developer workflow.
  - **ESLint**: Integrated ESLint with TypeScript support (`typescript-eslint`) to enforce code quality, catch potential errors, and maintain a consistent coding style across the project. A new `eslint.config.js` file has been added.
  - **TypeDoc**: Added TypeDoc for generating comprehensive API documentation from JSDoc comments. New configuration files (`typedoc.json`, `tsconfig.typedoc.json`, `tsdoc.json`) have been included.
- **Scripts**:
  - Added new npm scripts: `lint`, `lint:fix`, `typecheck`, `dev`, `dev:stdio`, `dev:http`, `audit`, and `audit:fix` to support the new tooling and improve development workflows.
  - Added `scripts/fetch-openapi-spec.ts` to download and save API specifications.
  - Added `scripts/README.md` to document the utility scripts.

### Changed

- **Core Refactoring**:
  - **Architectural Alignment**: The entire codebase has been refactored to strictly adhere to the "Logic Throws, Handler Catches" principle, improving separation of concerns and error handling consistency.
  - **JSDoc**: Added comprehensive JSDoc comments to all core files, tools, utilities, and scripts, enabling clear API documentation and better maintainability.
  - **Type Safety**: Replaced ambiguous `any` types with specific, inferred types from Zod schemas, enhancing type safety throughout the application.
- **Logging & Error Handling**:
  - **`RequestContext`**: Consistently passed `RequestContext` through the entire call stack for improved traceability and contextual logging.
  - **`ErrorHandler`**: Centralized error handling to use the `ErrorHandler` utility and structured `McpError` objects for consistent, machine-readable error responses.
- **Dependencies**:
  - Updated all major dependencies, including `@modelcontextprotocol/sdk`, `hono`, `zod`, and `winston`.
  - Added new development dependencies like `eslint`, `typescript-eslint`, `tsx`, and `typedoc`.

## v2.2.4 - 2025-07-29

### Added

- **Git Working Directory Resource**: Introduced a new resource, `git://working-directory`, which allows clients to retrieve the currently configured working directory for a session. This enhances contextual awareness for tools and agents interacting with the server.

### Changed

- **Documentation**: Updated `README.md` to include the new "Resources" section, documenting the `git://working-directory` resource. Also updated the version badge to `2.2.4`.

## v2.2.3 - 2025-07-29

### Added

- **Testing Framework**: Initial setup of Vitest testing framework for unit and integration testing. Added initial test setup, configurations (`vitest.config.ts`, `tsconfig.vitest.json`), and coverage reporting.
- **Git Signing**: Implemented automatic GPG/SSH signing for commit-creating operations (`git_commit`, `git_merge`, `git_cherry_pick`, `git_tag`) when `GIT_SIGN_COMMITS=true` is set. Includes a fallback to unsigned commits on signing failure.

### Changed

- **mcp-ts-template Alignment**: Updated the server to align with the latest changes in the [`mcp-ts-template` v1.7.7](https://github.com/cyanheads/mcp-ts-template/releases/tag/v1.7.7), including improvements to the project structure and configuration.
- **Configuration Overhaul**: Completely refactored `src/config/index.ts`. It now uses Zod for robust, type-safe validation of all environment variables, provides clear startup errors for misconfigurations, and automatically determines the project root.
- **Authentication Architecture**: Refactored the entire authentication system to use a strategy pattern.
  - Created `JwtStrategy` and `OauthStrategy` classes implementing a common `AuthStrategy` interface.
  - A new `authFactory` selects the strategy based on configuration.
  - A unified `authMiddleware` now delegates verification to the selected strategy, decoupling the transport layer from authentication logic.
- **Transport Layer Abstraction**: Decoupled the Hono web server from the MCP SDK's transport logic.
  - Introduced `StatefulTransportManager` and `StatelessTransportManager` to handle all session and request lifecycle logic.
  - The Hono `httpTransport` is now a thin layer responsible for routing, middleware, and bridging Hono's web streams with the SDK's Node.js streams. Streamable HTTP should work much better now.
  - This refactoring resulted in a major file reorganization within `src/mcp-server/transports/`.
- **Error Handling**: Improved the `ErrorHandler` to prevent mutation of original error objects and added several new `BaseErrorCode`s for more precise error reporting.

### Dependencies

- **Added**: `vitest`, `@vitest/coverage-v8`, `supertest`, `msw`, `@faker-js/faker` and other testing-related packages.
- **Updated**: `@modelcontextprotocol/sdk` to `^1.17.0`, `hono` to `^4.8.10`, and various other dependencies.

## v2.2.1 - 2025-07-17

### Changed

- **Error Handling Refactor**: Executed a comprehensive, mandatory refactoring across all Git tools to strictly enforce the "Logic Throws, Handler Catches" architectural principle. All `try...catch` blocks have been removed from the `logic.ts` files. The logic layer now exclusively throws structured `McpError`s on failure, while the `registration.ts` handler layer is solely responsible for catching and processing these errors. This ensures a clean separation of concerns and standardizes the error handling pipeline.
- **Structured Error Responses**: Updated all tool registration handlers to return a structured error object in the `structuredContent` field upon failure, including the `code`, `message`, and `details` of the `McpError`. This provides richer, machine-readable error context to the MCP client.
- **Dependency Updates**: Updated `@modelcontextprotocol/sdk` to `^1.16.0` and `openai` to `^5.10.1`.
- **Configuration**: Added `zod` to the reject list in `.ncurc.json` to prevent unintended upgrades.

## v2.2.0 - 2025-07-16

### Fixed

- **Validation Enforcement**: Corrected a critical flaw in two tool registration handlers (`gitTag`, `gitWorktree`) where the base Zod schema was used for registration instead of the refined schema. This meant that conditional validation rules (e.g., required fields for specific modes) were not being enforced. The handlers now explicitly parse incoming parameters with the full, refined schema, ensuring all validation logic is correctly applied before execution.

### Changed

- **Architectural Refactor**: Aligned the entire server with the latest architectural standards and the MCP specification (2025-06-18). This includes:
  - **Standardized Schemas**: All tools now use explicit Zod schemas for both input and output, ensuring type safety and clear data contracts. This enables structured output, a newer feature of the MCP specification. Not all MCP Clients support structured output so we keep backwards compatibility by returning stringified JSON.
  - **Logic/Handler Separation**: Core tool logic is now isolated in `logic.ts` files, with error handling managed by a dedicated `ErrorHandler` in the `registration.ts` handlers. This enforces the 'Logic Throws, Handler Catches' principle.
  - **Simplified State Management**: Removed state accessor initializers in favor of passing `getWorkingDirectory` and `getSessionId` functions directly to tool registration, cleaning up the server initialization process.
- **Tool Response Cleanup**: Refactored `git_push` and `git_pull` tools to remove redundant `summary` fields from their output, providing a cleaner and more concise response.
- **Tool Annotations**: Added descriptive annotations to all tool registrations to provide richer metadata to the client/LLM, improving tool discovery and usage.

### Dependencies

- Updated the following dependencies:
  - `@modelcontextprotocol/sdk` to `^1.15.1`
  - `@hono/node-server` to `^1.16.0`
  - `@types/node` to `^24.0.14`
  - `hono` to `^4.8.5`
  - `jose` to `^6.0.12`
  - `openai` to `^5.9.2`
- Updated the following devDependencies:
  - `typedoc` to `^0.28.7`

## v2.1.8 - 2025-06-29

### Fixed

- Downgraded `dotenv` to `^16.6.1` to suppress `dotenvx` promotional logging messages in v17.0 that were interfering with the stdio transport.
- Added `dotenv` to the `reject` list in `.ncurc.json` to prevent future automatic upgrades to problematic versions.

## v2.1.7 - 2025-06-29

### Changed

- Suppressed `dotenv` debug output to prevent interference with the stdio transport.
- Updated the fallback package name in the configuration for better error identification.

## v2.1.6 - 2025-06-29

### Dependencies

- Updated the following dependencies:
  - `@modelcontextprotocol/sdk` to `^1.13.2`
  - `@types/node` to `^24.0.7`
  - `dotenv` to `^17.0.0`
  - `hono` to `^4.8.3`
  - `openai` to `^5.8.2`
  - `winston-transport` to `^4.9.0`
- Updated the following devDependencies:
  - `prettier` to `^3.6.2`
  - `typedoc` to `^0.28.6`

### Changed

- Minor formatting changes across several files.

## v2.1.5 - 2025-06-29

### Security

- Patched a command injection vulnerability where unsanitized user input could be passed to `child_process.exec`. All `exec` calls have been replaced with the safer `execFile` method, which treats arguments as distinct values rather than executable script parts. Thank you to [@dellalibera](https://github.com/dellalibera) for the disclosure. For more details, see the security advisory: [GHSA-3q26-f695-pp76](https://github.com/cyanheads/git-mcp-server/security/advisories/GHSA-3q26-f695-pp76).

## v2.1.4 - 2025-06-20

### Changed

- **HTTP Transport Layer**: Migrated the entire HTTP transport from Express to Hono for improved performance and a more modern API. This includes new middleware for CORS, rate limiting, and error handling.
- **Authentication Architecture**: Refactored the authentication system into a modular, strategy-based architecture.
  - Supports both JWT and OAuth 2.1 bearer token validation.
  - Configuration is managed via `MCP_AUTH_MODE` environment variable.
  - Uses `AsyncLocalStorage` for safer, context-aware access to authentication info.
- **Session Management**: Simplified session state management by centralizing the working directory logic within the main server instance, removing transport-specific state handlers.

## v2.1.3 - 2025-06-20

### Changed

- (docs) Updated `README.md` to improve clarity, add a core capabilities table, and reflect new dependency versions.
- (docs) Updated `README.md` installation instructions to recommend `npx` for easier setup.

### Dependencies

- Updated the following dependencies:
  - `@modelcontextprotocol/inspector` to `^0.14.3`
  - `@modelcontextprotocol/sdk` to `^1.13.0`
  - `@types/jsonwebtoken` to `^9.0.10`
  - `@types/node` to `^24.0.3`
  - `@types/validator` to `^13.15.2`
  - `openai` to `^5.6.0`
  - `zod` to `^3.25.67`

## v2.1.2 - 2025-06-14

### Fixed

- (tools) `gitCommit` tool now provides a specific, clearer error message when a pre-commit hook fails, preventing confusion with merge conflicts. (Addresses GitHub Issue [#13](https://github.com/cyanheads/git-mcp-server/issues/13))

### Changed

- (tools) Refactored error handling across all Git tools to use structured `McpError` exceptions with specific `BaseErrorCode`s (e.g., `CONFLICT`, `NOT_FOUND`, `VALIDATION_ERROR`) instead of returning `{ success: false, ... }` objects. This provides more consistent and machine-readable error responses.
- (tools) Improved logging across all Git tools for better traceability and debugging, ensuring structured context is always included.
- (tools) Refined success and result objects for several tools (`gitPull`, `gitPush`, `gitMerge`, etc.) to be more consistent and structured.

### Dependencies

- Updated the following dependencies:
  - `@modelcontextprotocol/inspector` to `^0.14.1`
  - `@modelcontextprotocol/sdk` to `^1.12.3`

## v2.1.1 - 2025-06-13

### Changed

- (docs) Updated `README.md` to reflect the new version `2.1.1`.
- (docs) Updated `git_wrapup_instructions` tool description for clarity.
- (docs) Updated `git_wrapup_instructions` tool logic to include a prompt for the agent.

### Dependencies

- Updated the following dependencies:
  - `@modelcontextprotocol/inspector` to `^0.14.0`
  - `@types/node` to `^24.0.1`
  - `openai` to `^5.3.0`
  - `zod` to `^3.25.64`
  - `@types/express` to `^5.0.3` (devDependency)

### Other

- Bump version to 2.1.1.

## v2.1.0 - 2025-06-03

### Changed

- (tools) `gitStatus` tool:
  - Reworked JSON output structure to provide more detailed and categorized information for staged and unstaged changes (e.g., `Added`, `Modified`, `Deleted` arrays under `staged_changes` and `unstaged_changes`).
  - Updated tool description to accurately reflect the new, richer output format.
- (tools) `gitWrapupInstructions` tool:
  - Now includes the full JSON output of the `git_status` tool in its own result, providing immediate context on repository status when initiating a wrap-up.
  - Updated internal logic to fetch and integrate the `git_status` output.
  - Enhanced registration to initialize and utilize necessary session state accessors (`getWorkingDirectory`, `getSessionId`) for fetching Git status.
- (core) `server.ts`: Added initialization call for `gitWrapupInstructionsStateAccessors` to ensure the tool has access to session-specific context.
- (docs) `docs/tree.md`: Updated timestamp.

### Dependencies

- Updated the following dependencies:
  - `@types/node` to `^22.15.29`
  - `ignore` to `^7.0.5`
  - `openai` to `^5.0.2`
  - `zod` to `^3.25.49`

### Other

- Bump version to 2.1.0.

## v2.0.15 - 2025-05-30

### Changed

- (deps) Updated `@modelcontextprotocol/sdk` to `^1.12.1`.
- (deps) Downgraded `chrono-node` from `2.8.1` to `2.8.0`.
- (tools) Refined the instructional text within the `git_wrapup_instructions` tool for clarity and better formatting.
- (docs) Updated `README.md` to reflect new SDK version and project version.
- (docs) Updated `docs/tree.md` to reflect current project structure and new files.

### Added

- (config) Added `.ncurc.json` to specify `chrono-node` as a rejected update, pinning it to `2.8.0`.

### Other

- Bump version to 2.0.15.

## v2.0.14 - 2025-05-30

### Changed

- (tools) `git_diff` tool now supports an `includeUntracked` boolean parameter. If true, the diff output will also include the content of untracked files by comparing them against `/dev/null`.
- (docs) Updated `README.md` to reflect the new `includeUntracked` parameter in `git_diff` tool description and arguments table.
- (docs) Updated version badge in `README.md` to `v2.0.14`.
- (docs) Updated version in `README.md` Resources section to `v2.0.14`.

### Other

- Bump version to 2.0.14.

## v2.0.13 - 2025-05-30

### Added

- (tools) Added `git_wrapup_instructions` tool to provide a standard Git wrap-up workflow, including reviewing changes, updating documentation (README, CHANGELOG), and making logical commits.
- (core) Integrated the `git_wrapup_instructions` tool into the server by adding its registration in `src/mcp-server/server.ts`.

### Changed

- (docs) Updated `README.md` to include the new `git_wrapup_instructions` tool in the tools table.

### Other

- Bump version to 2.0.13 (implicitly).

## v2.0.12 - 2025-05-25

### Added

- (tools) Added `git_worktree` tool to manage Git worktrees, including listing, adding, removing, moving, and pruning.
- (tools) `gitSetWorkingDir` tool can now optionally initialize a new Git repository with `git init --initial-branch=main` if `initializeIfNotPresent: true` is set and the target directory is not already a Git repository.

### Changed

- (tools) `gitInit` tool now defaults the initial branch to `main` if no `initialBranch` is specified in the input.
- (security) Refactored `authMiddleware.ts` to align with MCP SDK's `AuthInfo` type, improving JWT claim handling for `clientId` and `scopes`. Invalid or missing scopes now default to an empty array.
- (deps) Updated various dependencies, including:
  - `@modelcontextprotocol/inspector` to `^0.13.0`
  - `@modelcontextprotocol/sdk` to `^1.12.0`
  - `@types/node` to `^22.15.21`
  - `@types/validator` to `^13.15.1`
  - `openai` to `^4.103.0`
  - `zod` to `^3.25.28`
  - `@types/express` to `^5.0.2` (devDependency)
- (docs) Updated `docs/tree.md` to include the new `gitWorktree` tool.
- (docs) Updated `README.md` to reflect the new `gitWorktree` tool, changes to `gitInit` and `gitSetWorkingDir`, and updated dependency versions.

### Fixed

- (http) Added a workaround in `httpTransport.ts` to sanitize `req.auth` for SDK compatibility, addressing potential type mismatches.

### Other

- Bump version to 2.0.12.

## v2.0.11 - 2025-05-14

### Fixed

- (logging) Replaced direct `console.log` calls for server startup messages in HTTP and STDIO transports with `logger.notice()` to ensure MCP client compatibility and prevent parsing issues. (Addresses GitHub Issue #9)
- (logging) Refactored internal logger (`utils/internal/logger.ts`):
  - Deferred informational setup messages (e.g., logs directory creation, console logging status) to use the logger's own `info()` method after Winston is initialized.
  - Made critical pre-initialization `console.error` and `console.warn` calls conditional on TTY to prevent non-JSONRPC output when running in stdio mode with an MCP client.
  - Extracted console formatting logic into a reusable helper function (`createWinstonConsoleFormat`) to reduce duplication.
  - Added comments explaining TTY-conditional logging for clarity.

### Changed

- (chore) Updated various dependencies (e.g., `@modelcontextprotocol/sdk`, `@types/node`, `openai`).
- (docs) Refreshed `docs/tree.md` to include `mcp.json` and reflect current structure.

### Other

- Bump version to 2.0.11.

## v2.0.10 - 2025-05-07

### Added

- (dev) Added MCP Inspector configuration (`mcp.json`) to define server settings for `git-mcp-server` and `git-mcp-server-http` when using the inspector. (bf3a164)
- (dev) Added npm scripts `inspector` and `inspector:http` to easily launch the MCP Inspector with the defined configurations. (bf3a164)

### Dependencies

- Added `@modelcontextprotocol/inspector: ^0.11.0` to `dependencies`. (bf3a164)

### Changed

- (docs) Updated version badge in `README.md` to `2.0.10`. (bf3a164)

### Other

- Bump version to 2.0.10. (bf3a164)

## v2.0.9 - 2025-05-07

### Added

- (gitLog) Group commit logs by author in the JSON response, providing a more structured view of commit history. (5b5e037)

### Changed

- (security) Refactored path sanitization (`sanitizePath`) across all tools to use an object response (`SanitizedPathInfo`), improving robustness and providing more context. This includes updated JSDoc, standardized error handling within sanitization, and minor refactors to other sanitization functions. (5b5e037)
- (gitDiff) The 'diff' field in the `gitDiff` tool's response now includes the string "No changes found." directly when no differences are detected, ensuring consistent output format. (5b5e037)

### Other

- Bump version to 2.0.9. (bfe23ea)

## v2.0.8 - 2025-05-07

### Fixed

- Resolved issue where Windows drive letters could be stripped from absolute paths during sanitization when `allowAbsolute` was not explicitly true. This primarily affected `git_set_working_dir` and other tools when absolute paths were provided. The `sanitizePath` calls in git tool logic now correctly pass `{ allowAbsolute: true }`. Fixes GitHub Issue #8. (`6f405a1`)

### Changed

- (security) Update `sanitizePath` calls in all git tool logic to explicitly pass `{ allowAbsolute: true }` ensuring correct handling of absolute paths. (`6f405a1`)

### Dependencies

- Update `@types/node` from `^22.15.9` to `^22.15.15`. (`c28fe86`)

### Other

- Bump version to 2.0.8 (implicitly, as part of user's update process and reflected in package.json by commit `c28fe86` which was intended for 2.0.7 but now aligns with 2.0.8)

## v2.0.5 - 2025-05-05

### Added

- (tools) Enhance `git_commit` tool result to include commit message and committed files list (`1f74915`)

### Changed

- (core) Alphabetize tool imports and initializers in `server.ts` for better organization (`1f74915`)
- (docs) Refine `git_commit` tool description for clarity (`1f74915`)

### Other

- Bump version to 2.0.5 (`1f74915`)

## v2.0.4 - 2025-05-05

- (docs): Added smithery.yaml

## v2.0.3 - 2025-05-05

### Added

- (tools) Enhance git_commit escaping & add showSignature to git_log (`312d431`)

### Changed

- (core) Update server logic and configuration (`75b6683`)
- (tools) Update git tool implementations (`8b9ddaf`)
- (transport) Update transport implementations and add auth middleware (`a043d20`)
- (internal) Consolidate utilities and update types (`051ad9f`)
- Reorganize utilities and server transport handling (`b5c5840`)

### Documentation

- Update project structure in README and tree (`bc8f033`)
- (signing) Improve commit signing docs and add fallback logic (`de28bef`)
- Update README and file tree, remove temporary diff file (`3f86039`)

### Other

- **test**: Test automatic commit signing (commit.gpgsign=true) (`ef094d3`)
- **chore**: Update dependencies (`3cb662a`)
