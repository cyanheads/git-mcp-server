# git-mcp-server - Directory Structure

Generated on: 2025-10-15 15:14:11

```
git-mcp-server
├── .clinerules
│   └── clinerules.md
├── .github
│   ├── codeql
│   │   └── codeql-config.yml
│   ├── workflows
│   │   └── publish.yml
│   └── FUNDING.yml
├── .husky
├── coverage
├── docs
│   └── tree.md
├── scripts
│   ├── clean.ts
│   ├── devcheck.ts
│   ├── devdocs.ts
│   ├── fetch-openapi-spec.ts
│   ├── make-executable.ts
│   ├── tree.ts
│   └── validate-mcp-publish-schema.ts
├── src
│   ├── config
│   │   └── index.ts
│   ├── container
│   │   ├── registrations
│   │   │   ├── core.ts
│   │   │   └── mcp.ts
│   │   ├── index.ts
│   │   └── tokens.ts
│   ├── mcp-server
│   │   ├── prompts
│   │   │   ├── definitions
│   │   │   │   ├── git-wrapup.prompt.ts
│   │   │   │   └── index.ts
│   │   │   ├── utils
│   │   │   │   └── promptDefinition.ts
│   │   │   └── prompt-registration.ts
│   │   ├── resources
│   │   │   ├── definitions
│   │   │   │   ├── git-working-directory.resource.ts
│   │   │   │   └── index.ts
│   │   │   ├── utils
│   │   │   │   ├── resourceDefinition.ts
│   │   │   │   └── resourceHandlerFactory.ts
│   │   │   └── resource-registration.ts
│   │   ├── roots
│   │   │   └── roots-registration.ts
│   │   ├── tools
│   │   │   ├── definitions
│   │   │   │   ├── git-add.tool.ts
│   │   │   │   ├── git-blame.tool.ts
│   │   │   │   ├── git-branch.tool.ts
│   │   │   │   ├── git-checkout.tool.ts
│   │   │   │   ├── git-cherry-pick.tool.ts
│   │   │   │   ├── git-clean.tool.ts
│   │   │   │   ├── git-clear-working-dir.tool.ts
│   │   │   │   ├── git-clone.tool.ts
│   │   │   │   ├── git-commit.tool.ts
│   │   │   │   ├── git-diff.tool.ts
│   │   │   │   ├── git-fetch.tool.ts
│   │   │   │   ├── git-init.tool.ts
│   │   │   │   ├── git-log.tool.ts
│   │   │   │   ├── git-merge.tool.ts
│   │   │   │   ├── git-pull.tool.ts
│   │   │   │   ├── git-push.tool.ts
│   │   │   │   ├── git-rebase.tool.ts
│   │   │   │   ├── git-reflog.tool.ts
│   │   │   │   ├── git-remote.tool.ts
│   │   │   │   ├── git-reset.tool.ts
│   │   │   │   ├── git-set-working-dir.tool.ts
│   │   │   │   ├── git-show.tool.ts
│   │   │   │   ├── git-stash.tool.ts
│   │   │   │   ├── git-status.tool.ts
│   │   │   │   ├── git-tag.tool.ts
│   │   │   │   ├── git-worktree.tool.ts
│   │   │   │   ├── git-wrapup-instructions.tool.ts
│   │   │   │   └── index.ts
│   │   │   ├── schemas
│   │   │   │   └── common.ts
│   │   │   ├── utils
│   │   │   │   ├── git-formatters.ts
│   │   │   │   ├── git-validators.ts
│   │   │   │   ├── json-response-formatter.ts
│   │   │   │   ├── markdown-builder.ts
│   │   │   │   ├── toolDefinition.ts
│   │   │   │   └── toolHandlerFactory.ts
│   │   │   └── tool-registration.ts
│   │   ├── transports
│   │   │   ├── auth
│   │   │   │   ├── lib
│   │   │   │   │   ├── authContext.ts
│   │   │   │   │   ├── authTypes.ts
│   │   │   │   │   ├── authUtils.ts
│   │   │   │   │   └── withAuth.ts
│   │   │   │   ├── strategies
│   │   │   │   │   ├── authStrategy.ts
│   │   │   │   │   ├── jwtStrategy.ts
│   │   │   │   │   └── oauthStrategy.ts
│   │   │   │   ├── authFactory.ts
│   │   │   │   ├── authMiddleware.ts
│   │   │   │   └── index.ts
│   │   │   ├── http
│   │   │   │   ├── httpErrorHandler.ts
│   │   │   │   ├── httpTransport.ts
│   │   │   │   ├── httpTypes.ts
│   │   │   │   ├── index.ts
│   │   │   │   └── sessionManager.ts
│   │   │   ├── stdio
│   │   │   │   ├── index.ts
│   │   │   │   └── stdioTransport.ts
│   │   │   ├── ITransport.ts
│   │   │   └── manager.ts
│   │   └── server.ts
│   ├── services
│   │   ├── git
│   │   │   ├── core
│   │   │   │   ├── BaseGitProvider.ts
│   │   │   │   ├── GitProviderFactory.ts
│   │   │   │   └── IGitProvider.ts
│   │   │   ├── providers
│   │   │   │   ├── cli
│   │   │   │   │   ├── operations
│   │   │   │   │   │   ├── branches
│   │   │   │   │   │   │   ├── branch.ts
│   │   │   │   │   │   │   ├── checkout.ts
│   │   │   │   │   │   │   ├── cherry-pick.ts
│   │   │   │   │   │   │   ├── merge.ts
│   │   │   │   │   │   │   └── rebase.ts
│   │   │   │   │   │   ├── commits
│   │   │   │   │   │   │   ├── commit.ts
│   │   │   │   │   │   │   ├── diff.ts
│   │   │   │   │   │   │   ├── log.ts
│   │   │   │   │   │   │   └── show.ts
│   │   │   │   │   │   ├── core
│   │   │   │   │   │   │   ├── clean.ts
│   │   │   │   │   │   │   ├── clone.ts
│   │   │   │   │   │   │   ├── init.ts
│   │   │   │   │   │   │   └── status.ts
│   │   │   │   │   │   ├── history
│   │   │   │   │   │   │   ├── blame.ts
│   │   │   │   │   │   │   └── reflog.ts
│   │   │   │   │   │   ├── remotes
│   │   │   │   │   │   │   ├── fetch.ts
│   │   │   │   │   │   │   ├── pull.ts
│   │   │   │   │   │   │   ├── push.ts
│   │   │   │   │   │   │   └── remote.ts
│   │   │   │   │   │   ├── staging
│   │   │   │   │   │   │   ├── add.ts
│   │   │   │   │   │   │   └── reset.ts
│   │   │   │   │   │   ├── stash
│   │   │   │   │   │   │   └── stash.ts
│   │   │   │   │   │   ├── tags
│   │   │   │   │   │   │   └── tag.ts
│   │   │   │   │   │   ├── worktree
│   │   │   │   │   │   │   └── worktree.ts
│   │   │   │   │   │   └── index.ts
│   │   │   │   │   ├── utils
│   │   │   │   │   │   ├── command-builder.ts
│   │   │   │   │   │   ├── config-helper.ts
│   │   │   │   │   │   ├── error-mapper.ts
│   │   │   │   │   │   ├── git-executor.ts
│   │   │   │   │   │   ├── git-validators.ts
│   │   │   │   │   │   ├── index.ts
│   │   │   │   │   │   ├── output-parser.ts
│   │   │   │   │   │   └── runtime-adapter.ts
│   │   │   │   │   ├── CliGitProvider.ts
│   │   │   │   │   └── index.ts
│   │   │   │   └── isomorphic
│   │   │   │       ├── operations
│   │   │   │       └── utils
│   │   │   ├── index.ts
│   │   │   └── types.ts
│   │   ├── llm
│   │   │   ├── core
│   │   │   │   └── ILlmProvider.ts
│   │   │   ├── providers
│   │   │   │   └── openrouter.provider.ts
│   │   │   ├── index.ts
│   │   │   └── types.ts
│   │   └── speech
│   │       ├── core
│   │       │   ├── ISpeechProvider.ts
│   │       │   └── SpeechService.ts
│   │       ├── providers
│   │       │   ├── elevenlabs.provider.ts
│   │       │   └── whisper.provider.ts
│   │       ├── index.ts
│   │       └── types.ts
│   ├── storage
│   │   ├── core
│   │   │   ├── IStorageProvider.ts
│   │   │   ├── storageFactory.ts
│   │   │   ├── StorageService.ts
│   │   │   └── storageValidation.ts
│   │   ├── providers
│   │   │   ├── cloudflare
│   │   │   │   ├── index.ts
│   │   │   │   ├── kvProvider.ts
│   │   │   │   └── r2Provider.ts
│   │   │   ├── fileSystem
│   │   │   │   └── fileSystemProvider.ts
│   │   │   ├── inMemory
│   │   │   │   └── inMemoryProvider.ts
│   │   │   └── supabase
│   │   │       ├── supabase.types.ts
│   │   │       └── supabaseProvider.ts
│   │   └── index.ts
│   ├── types-global
│   │   └── errors.ts
│   ├── utils
│   │   ├── internal
│   │   │   ├── error-handler
│   │   │   │   ├── errorHandler.ts
│   │   │   │   ├── helpers.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── mappings.ts
│   │   │   │   └── types.ts
│   │   │   ├── encoding.ts
│   │   │   ├── health.ts
│   │   │   ├── index.ts
│   │   │   ├── logger.ts
│   │   │   ├── performance.ts
│   │   │   ├── requestContext.ts
│   │   │   ├── runtime.ts
│   │   │   └── startupBanner.ts
│   │   ├── metrics
│   │   │   ├── index.ts
│   │   │   ├── registry.ts
│   │   │   └── tokenCounter.ts
│   │   ├── network
│   │   │   ├── fetchWithTimeout.ts
│   │   │   └── index.ts
│   │   ├── parsing
│   │   │   ├── csvParser.ts
│   │   │   ├── dateParser.ts
│   │   │   ├── index.ts
│   │   │   ├── jsonParser.ts
│   │   │   ├── pdfParser.ts
│   │   │   ├── xmlParser.ts
│   │   │   └── yamlParser.ts
│   │   ├── scheduling
│   │   │   ├── index.ts
│   │   │   └── scheduler.ts
│   │   ├── security
│   │   │   ├── idGenerator.ts
│   │   │   ├── index.ts
│   │   │   ├── rateLimiter.ts
│   │   │   └── sanitization.ts
│   │   ├── telemetry
│   │   │   ├── index.ts
│   │   │   ├── instrumentation.ts
│   │   │   ├── semconv.ts
│   │   │   └── trace.ts
│   │   └── index.ts
│   ├── index.ts
│   └── worker.ts
├── tests
│   ├── config
│   │   ├── index.int.test.ts
│   │   └── index.test.ts
│   ├── mcp-server
│   │   ├── resources
│   │   │   └── definitions
│   │   ├── tools
│   │   │   ├── definitions
│   │   │   │   ├── helpers
│   │   │   │   │   ├── assertions.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── mockGitProvider.ts
│   │   │   │   │   ├── mockStorageService.ts
│   │   │   │   │   └── testContext.ts
│   │   │   │   ├── integration
│   │   │   │   ├── unit
│   │   │   │   │   ├── git-add.tool.test.ts
│   │   │   │   │   ├── git-branch.tool.test.ts
│   │   │   │   │   ├── git-commit.tool.test.ts
│   │   │   │   │   ├── git-log.tool.test.ts
│   │   │   │   │   └── git-status.tool.test.ts
│   │   │   │   └── README.md
│   │   │   └── utils
│   │   │       └── markdown-builder.test.ts
│   │   └── transports
│   │       └── auth
│   │           └── lib
│   │               └── authUtils.test.ts
│   ├── mocks
│   │   ├── handlers.ts
│   │   └── server.ts
│   ├── storage
│   │   ├── providers
│   │   │   ├── cloudflare
│   │   │   │   ├── kvProvider.test.ts
│   │   │   │   └── r2Provider.test.ts
│   │   │   └── inMemory
│   │   │       └── inMemoryProvider.test.ts
│   │   └── storageProviderCompliance.test.ts
│   ├── utils
│   │   ├── internal
│   │   │   ├── encoding.test.ts
│   │   │   ├── errorHandler.int.test.ts
│   │   │   ├── errorHandler.unit.test.ts
│   │   │   ├── health.test.ts
│   │   │   ├── logger.int.test.ts
│   │   │   ├── performance.init.test.ts
│   │   │   ├── performance.test.ts
│   │   │   ├── requestContext.test.ts
│   │   │   ├── runtime.test.ts
│   │   │   └── startupBanner.test.ts
│   │   ├── metrics
│   │   │   ├── registry.test.ts
│   │   │   └── tokenCounter.test.ts
│   │   ├── network
│   │   │   └── fetchWithTimeout.test.ts
│   │   ├── parsing
│   │   │   ├── csvParser.test.ts
│   │   │   ├── dateParser.test.ts
│   │   │   ├── jsonParser.test.ts
│   │   │   ├── pdfParser.test.ts
│   │   │   ├── xmlParser.test.ts
│   │   │   └── yamlParser.test.ts
│   │   ├── scheduling
│   │   │   └── scheduler.test.ts
│   │   └── security
│   │       ├── idGenerator.test.ts
│   │       ├── rateLimiter.test.ts
│   │       └── sanitization.test.ts
│   └── setup.ts
├── .dockerignore
├── .env.example
├── .gitattributes
├── .gitignore
├── .prettierignore
├── .prettierrc.json
├── AGENTS.md
├── bun.lock
├── bunfig.toml
├── CHANGELOG.md
├── CLAUDE.md
├── eslint.config.js
├── LICENSE
├── package.json
├── README.md
├── repomix.config.json
├── server.json
├── smithery.yaml
├── tsconfig.json
├── tsconfig.test.json
├── tsdoc.json
├── typedoc.json
├── vitest.config.ts
└── wrangler.toml
```

_Note: This tree excludes files and directories matched by .gitignore and default patterns._
