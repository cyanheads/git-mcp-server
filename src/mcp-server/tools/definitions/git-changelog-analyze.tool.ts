/**
 * @fileoverview Git changelog analyze tool - provide git context and review instructions for LLM-driven changelog analysis
 * @module mcp-server/tools/definitions/git-changelog-analyze
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { CommitRefSchema, PathSchema } from '../schemas/common.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';

const TOOL_NAME = 'git_changelog_analyze';
const TOOL_TITLE = 'Git Changelog Analyze';
const TOOL_DESCRIPTION =
  'Gather git history context (commits, tags) and structured review instructions to support LLM-driven changelog analysis. Changelog file should be read separately; this tool provides the supporting git data and analysis framework. Pass one or more review types to control what kind of analysis to perform.';

// ---------------------------------------------------------------------------
// Review type definitions
// ---------------------------------------------------------------------------

const ReviewTypeSchema = z.enum([
  'security',
  'features',
  'storyline',
  'gaps',
  'breaking_changes',
  'quality',
]);

type ReviewType = z.infer<typeof ReviewTypeSchema>;

const REVIEW_TYPE_INSTRUCTIONS: Record<ReviewType, string> = {
  security: `## Security Review
Examine the changelog entries and cross-reference with the provided git commits. Identify:
- Security-related commits (touching auth, crypto, input validation, dependency updates) that lack changelog documentation
- Changelog entries that understate the security implications of changes
- Patterns suggesting security debt (repeated quick-fixes to security-adjacent areas)
- Missing CVE references or security advisory links for dependency updates
- Changes to access control, session management, or data handling that should be called out explicitly`,

  features: `## Feature Trajectory Review
Analyze the progression of features documented in the changelog alongside recent commit activity to identify:
- Logical next features based on the development direction and momentum
- Features that appear partially implemented (started in one version, not completed in subsequent ones)
- Feature areas receiving heavy investment vs areas being neglected
- Opportunities for feature consolidation or decomposition
- Gaps between what commits show being built and what the changelog advertises`,

  storyline: `## Project Storyline Review
Narrate the project's evolution using the changelog as the primary source and tags as milestones:
- Describe the arc of the project from earliest to latest entry
- Identify major pivots, theme shifts, or focus changes between releases
- Highlight the most significant releases and what made them important
- Characterize the project's current phase (early development, rapid growth, stabilization, mature maintenance)
- Note the rhythm of releases — accelerating, steady, or slowing`,

  gaps: `## Gap Analysis
Cross-reference the changelog with the provided git commit history to find discrepancies:
- Commits that introduce meaningful changes but have no corresponding changelog entry
- Version bumps in tags that lack changelog documentation
- Categories of changes systematically under-documented (e.g., always documents features but never documents fixes or internal refactors)
- Time periods with high commit activity but sparse changelog updates
- Changelog entries that don't correspond to identifiable commits (phantom entries)`,

  breaking_changes: `## Breaking Changes Review
Analyze the changelog for breaking change documentation quality:
- Are breaking changes clearly marked and easy to find (dedicated section, visual callout)?
- Do major version bumps (in tags) correlate with documented breaking changes?
- Are migration paths or upgrade instructions provided for each breaking change?
- What is the frequency and pattern of breaking changes over time — increasing or stabilizing?
- Are breaking changes concentrated in certain areas of the project?
- Are deprecation notices given before removals?`,

  quality: `## Quality Trends Review
Examine commit history and changelog entries for code quality and process health indicators:
- Ratio of bug fixes to features over time — is the project stabilizing or accumulating debt?
- Commit message quality and consistency (conventional commits adherence, descriptive subjects)
- Frequency of "hotfix" or "emergency" patterns suggesting insufficient testing
- Documentation update frequency relative to code changes
- Release cadence regularity — predictable schedule or sporadic?
- Revert frequency and what it suggests about review/testing practices`,
};

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const InputSchema = z.object({
  path: PathSchema,
  reviewTypes: z
    .array(ReviewTypeSchema)
    .min(1)
    .describe(
      'Types of changelog review to perform. At least one required. Options: security, features, storyline, gaps, breaking_changes, quality.',
    ),
  maxCommits: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(200)
    .describe(
      'Maximum recent commits to fetch for cross-referencing (1-1000).',
    ),
  sinceTag: z
    .string()
    .optional()
    .describe(
      'Only include git history since this tag (e.g., "v1.2.0"). Narrows the analysis window.',
    ),
  branch: CommitRefSchema.optional().describe(
    'Branch to analyze (defaults to current branch).',
  ),
});

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

const CommitSummarySchema = z.object({
  hash: z.string().describe('Short commit hash.'),
  subject: z.string().describe('Commit subject line.'),
  author: z.string().describe('Commit author.'),
  timestamp: z.number().int().describe('Unix timestamp.'),
  refs: z
    .array(z.string())
    .optional()
    .describe('Tags or branches at this commit.'),
});

const TagSummarySchema = z.object({
  name: z.string().describe('Tag name.'),
  commit: z.string().describe('Commit hash the tag points to.'),
  timestamp: z.number().int().optional().describe('Tag creation timestamp.'),
  message: z.string().optional().describe('Annotated tag message.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  reviewTypes: z
    .array(ReviewTypeSchema)
    .describe('Review types that were requested.'),
  gitContext: z
    .object({
      currentBranch: z.string().nullable().describe('Current branch name.'),
      totalCommitsFetched: z
        .number()
        .int()
        .describe('Number of commits returned.'),
      commits: z
        .array(CommitSummarySchema)
        .describe('Recent commits for cross-referencing.'),
      tags: z
        .array(TagSummarySchema)
        .describe('Repository tags for release context.'),
    })
    .describe('Git history context for changelog cross-referencing.'),
  reviewInstructions: z
    .string()
    .describe(
      'Analysis instructions for each requested review type. Guides the LLM on what to look for in the changelog.',
    ),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

// ---------------------------------------------------------------------------
// Helper: build review instructions from selected types
// ---------------------------------------------------------------------------

function buildReviewInstructions(reviewTypes: ReviewType[]): string {
  const preamble =
    'Analyze the changelog file using the git context provided below. For each review type, produce structured findings with specific references to changelog entries and commits.\n';

  const sections = reviewTypes
    .map((type) => REVIEW_TYPE_INSTRUCTIONS[type])
    .join('\n\n');

  return `${preamble}\n${sections}`;
}

// ---------------------------------------------------------------------------
// Tool logic
// ---------------------------------------------------------------------------

async function gitChangelogAnalyzeLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const operationContext = {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  };

  // Build log options
  const logOptions: {
    maxCount: number;
    branch?: string;
  } = {
    maxCount: input.maxCommits,
  };

  if (input.sinceTag) {
    logOptions.branch = `${input.sinceTag}..HEAD`;
  } else if (input.branch) {
    logOptions.branch = input.branch;
  }

  // Fetch commits, tags, and status in parallel
  const [logResult, tagResult, statusResult] = await Promise.all([
    provider.log(logOptions, operationContext),
    provider.tag({ mode: 'list' }, operationContext),
    provider.status({ includeUntracked: false }, operationContext),
  ]);

  const reviewInstructions = buildReviewInstructions(input.reviewTypes);

  return {
    success: true,
    reviewTypes: input.reviewTypes,
    gitContext: {
      currentBranch: statusResult.currentBranch,
      totalCommitsFetched: logResult.totalCount,
      commits: logResult.commits.map((c) => ({
        hash: c.shortHash,
        subject: c.subject,
        author: c.author,
        timestamp: c.timestamp,
        ...(c.refs && c.refs.length > 0 && { refs: c.refs }),
      })),
      tags: (tagResult.tags ?? []).map((t) => ({
        name: t.name,
        commit: t.commit,
        ...(t.timestamp != null && { timestamp: t.timestamp }),
        ...(t.message != null && { message: t.message }),
      })),
    },
    reviewInstructions,
  };
}

// ---------------------------------------------------------------------------
// Verbosity filter
// ---------------------------------------------------------------------------

/**
 * Filter output based on verbosity level.
 *
 * - minimal: Success, review types, commit count, and instructions (no arrays)
 * - standard/full: Complete output (LLMs need full context)
 */
function filterChangelogAnalyzeOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  if (level === 'minimal') {
    return {
      success: result.success,
      reviewTypes: result.reviewTypes,
      gitContext: {
        currentBranch: result.gitContext.currentBranch,
        totalCommitsFetched: result.gitContext.totalCommitsFetched,
        commits: [],
        tags: [],
      },
      reviewInstructions: result.reviewInstructions,
    };
  }

  return result;
}

const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterChangelogAnalyzeOutput,
});

// ---------------------------------------------------------------------------
// Tool definition export
// ---------------------------------------------------------------------------

export const gitChangelogAnalyzeTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(
    ['tool:git:read'],
    createToolHandler(gitChangelogAnalyzeLogic),
  ),
  responseFormatter,
};
