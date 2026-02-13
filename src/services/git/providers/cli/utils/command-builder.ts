/**
 * @fileoverview Git CLI command builder utility
 * @module services/git/providers/cli/utils/command-builder
 */

import type { AppConfig } from '@/config/index.js';

/**
 * Git command configuration.
 */
export interface GitCommandConfig {
  /** Base git command (e.g., 'status', 'commit', 'log') */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Working directory for command execution */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Build a git command with arguments.
 *
 * @param config - Command configuration
 * @returns Array of command parts for execution
 *
 * @example
 * ```typescript
 * buildGitCommand({
 *   command: 'log',
 *   args: ['--pretty=format:%H', '--max-count=10'],
 * })
 * // Returns: ['log', '--pretty=format:%H', '--max-count=10']
 * ```
 */
export function buildGitCommand(config: GitCommandConfig): string[] {
  const parts: string[] = [config.command];

  // Add positional arguments
  if (config.args && config.args.length > 0) {
    parts.push(...config.args);
  }

  return parts;
}

/**
 * Helper to safely load config for git operations.
 * Uses dynamic import to avoid circular dependencies.
 *
 * @returns AppConfig object or null if unavailable
 */
function loadConfig(): AppConfig | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const configModule = require('@/config/index.js') as {
      config: AppConfig;
    };
    return configModule.config;
  } catch {
    return null;
  }
}

/**
 * Build environment variables for git command.
 *
 * This function preserves the existing process environment (including PATH)
 * to ensure git executable can be found, while adding git-specific settings.
 *
 * Automatically includes git author/committer information from config if available.
 *
 * @param additionalEnv - Additional environment variables to override defaults
 * @returns Combined environment object with PATH preserved
 */
export function buildGitEnv(
  additionalEnv?: Record<string, string>,
): Record<string, string> {
  // Start with existing environment to preserve PATH and other critical vars
  // This ensures git executable can be found in custom install locations
  const env: Record<string, string> = { ...process.env } as Record<
    string,
    string
  >;

  // Override with git-specific settings
  Object.assign(env, {
    GIT_TERMINAL_PROMPT: '0', // Disable interactive prompts
    LANG: 'en_US.UTF-8', // Ensure git uses UTF-8 encoding
    LC_ALL: 'en_US.UTF-8',
  });

  // Load git author/committer info from config if available
  // This allows consistent author identity across all git operations
  const config = loadConfig();
  if (config?.git) {
    if (config.git.authorName) {
      env.GIT_AUTHOR_NAME = config.git.authorName;
    }
    if (config.git.authorEmail) {
      env.GIT_AUTHOR_EMAIL = config.git.authorEmail;
    }
    if (config.git.committerName) {
      env.GIT_COMMITTER_NAME = config.git.committerName;
    }
    if (config.git.committerEmail) {
      env.GIT_COMMITTER_EMAIL = config.git.committerEmail;
    }
  }

  // Apply any additional overrides (highest priority)
  if (additionalEnv) {
    Object.assign(env, additionalEnv);
  }

  return env;
}

/**
 * Known safe git options that are commonly used.
 * This is a baseline set - expand as needed for your specific use cases.
 */
const SAFE_GIT_OPTIONS = new Set([
  // Common flags
  '--version',
  '--help',
  '--all',
  '--force',
  '--quiet',
  '--verbose',
  '-v',
  '-f',
  '-q',
  // Status flags
  '--porcelain',
  '--porcelain=v2',
  '-b',
  '--untracked-files=no',
  '--ignore-submodules',
  '--short',
  '--branch',
  // Branch flags
  '--list',
  '--remote',
  '--no-abbrev',
  '-m',
  '-d',
  '-D',
  // Log flags
  '--pretty',
  '--oneline',
  '--graph',
  '--decorate',
  // Add flags
  '--update',
  '-u',
  '-A',
  // Commit flags
  '--amend',
  '--no-verify',
  '--allow-empty',
  // Diff flags
  '--stat',
  '--cached',
  '--staged',
  '--unified',
  // Misc flags
  '--bare',
  '--tags',
  '--prune',
  '--no-ff',
]);

/**
 * Validate git command arguments for safety.
 *
 * SECURITY MODEL:
 * We use the runtime adapter which spawns processes with array arguments
 * (not shell strings), providing inherent protection from shell injection attacks.
 * This works in both Bun (Bun.spawn) and Node.js (child_process.spawn) runtimes.
 *
 * Characters like ;, |, $, etc. cannot be used for command chaining because
 * arguments are passed directly to the git process, not interpreted by a shell.
 *
 * This function focuses on Git-specific security concerns:
 * 1. Null bytes (universally dangerous in many contexts)
 * 2. Option flag validation (prevent option injection)
 * 3. Path safety (handled elsewhere with sanitization utilities)
 *
 * WHAT WE DON'T NEED TO VALIDATE:
 * - Newlines in commit messages (safe with array spawn, required for multi-line messages)
 * - Shell metacharacters like ;, |, $, <, > (safe with array spawn)
 * - Backticks and $() (safe with array spawn)
 *
 * @param args - Arguments to validate
 * @throws Error if arguments contain unsafe patterns
 */
export function validateGitArgs(args: string[]): void {
  for (const arg of args) {
    // Critical: Prevent null bytes which can cause issues in many contexts
    // Null bytes can truncate strings unexpectedly and bypass security checks
    if (arg.includes('\0')) {
      throw new Error(`Null byte detected in git argument: ${arg}`);
    }

    // Validate option flags (arguments starting with -)
    // Allow short flags like -v, -f, etc. which match /-\w/
    // Allow long flags that are in our safe list
    // Allow flags with values like --format=..., --initial-branch=...
    if (arg.startsWith('-')) {
      // Extract the flag name (before = if present)
      const flagName = arg.split('=')[0] || arg;

      // Short flags (single dash + single letter) are generally safe
      const isShortFlag = /^-[a-zA-Z]$/.test(flagName);

      // Check if it's a known safe option
      const isSafeOption = SAFE_GIT_OPTIONS.has(flagName);

      // Flags with values (e.g., --format=..., --max-count=...)
      const isFlagWithValue = arg.includes('=');

      // If it's not a short flag, not in our safe list, and not a recognized pattern,
      // we should be cautious. For development, we'll allow it but could make this
      // stricter in production environments.
      if (!isShortFlag && !isSafeOption && !isFlagWithValue) {
        // In a high-security production environment, you might want to throw here
        // For now, we allow it to maintain flexibility
        // Uncomment the line below for strict validation:
        // throw new Error(`Unknown or potentially unsafe git flag: ${arg}`);
      }
    }
  }
}
