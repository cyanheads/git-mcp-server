#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * @fileoverview Comprehensive development script for quality and security checks.
 * @module scripts/devcheck
 * @description
 *   This script runs a series of checks (linting, types, formatting, security, etc.).
 *   It is optimized for speed, especially in pre-commit hooks, by analyzing only staged files where possible.
 *
 * @example
 * // Run all checks (Auto-fixing enabled):
 * // bun run scripts/devcheck.ts
 *
 * // Run in read-only mode:
 * // bun run scripts/devcheck.ts --no-fix
 *
 * // Skip specific checks:
 * // bun run scripts/devcheck.ts --no-lint --no-audit
 */
import { spawn } from 'bun';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// =============================================================================
// Embedded Dependencies
// =============================================================================

// picocolors (https://github.com/alexeyraspopov/picocolors) - MIT License
// Embedded so the script runs without needing 'npm install'.
const isColorSupported = process.stdout.isTTY;

const createColor =
  (open: string, close: string, re: RegExp, reset: string) =>
  (str: string | number) =>
    isColorSupported
      ? open + ('' + str).replace(re, open + reset + open) + close
      : '' + str;

const c = {
  bold: (s: string | number) =>
    createColor('\x1b[1m', '\x1b[22m', /\\x1b\[22m/g, '\x1b[1m')(s),
  dim: (s: string | number) =>
    createColor('\x1b[2m', '\x1b[22m', /\\x1b\[22m/g, '\x1b[2m')(s),
  red: (s: string | number) =>
    createColor('\x1b[31m', '\x1b[39m', /\\x1b\[39m/g, '\x1b[31m')(s),
  green: (s: string | number) =>
    createColor('\x1b[32m', '\x1b[39m', /\\x1b\[39m/g, '\x1b[32m')(s),
  yellow: (s: string | number) =>
    createColor('\x1b[33m', '\x1b[39m', /\\x1b\[39m/g, '\x1b[33m')(s),
  blue: (s: string | number) =>
    createColor('\x1b[34m', '\x1b[39m', /\\x1b\[39m/g, '\x1b[34m')(s),
  magenta: (s: string | number) =>
    createColor('\x1b[35m', '\x1b[39m', /\\x1b\[39m/g, '\x1b[35m')(s),
  cyan: (s: string | number) =>
    createColor('\x1b[36m', '\x1b[39m', /\\x1b\[39m/g, '\x1b[36m')(s),
};

/** A type alias for the picocolors object. */
type Colors = typeof c;

// =============================================================================
// Types & Interfaces
// =============================================================================

type RunMode = 'check' | 'fix';
type UIMode = 'Checking' | 'Fixing';

interface AppContext {
  flags: Set<string>;
  noFix: boolean;
  isHuskyHook: boolean;
  rootDir: string;
  /** List of staged files, populated only if isHuskyHook is true. */
  stagedFiles: string[];
}

interface CommandResult {
  checkName: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  skipped: boolean;
}

/** Represents the raw result from a shell execution. */
type ShellResult = Omit<CommandResult, 'checkName' | 'duration' | 'skipped'>;

interface Check {
  name: string;
  /** The flag to skip this check (e.g., '--no-lint'). */
  flag: string;
  /** Function that returns the command array based on the context and mode. Returns null to skip. */
  getCommand: (ctx: AppContext, mode: RunMode) => string[] | null;
  /** Indicates if the check supports auto-fixing. */
  canFix: boolean;
  tip?: (c: Colors) => string;
  /**
   * Optional predicate to determine success.
   * Useful for tools that signal issues via stdout or have non-standard exit codes.
   */
  isSuccess?: (result: ShellResult, mode: RunMode) => boolean;
}

// =============================================================================
// Shell Operations
// =============================================================================

const Shell = {
  /**
   * Executes a shell command using Bun.spawn and returns a structured result.
   */
  async exec(cmd: string[], options: { cwd: string }): Promise<ShellResult> {
    try {
      // Use 'pipe' to capture output for the summary.
      const proc = spawn(cmd, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const exitCode = await proc.exited;

      return {
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error) {
      // Handle cases where the command itself fails to spawn (e.g., command not found)
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        exitCode: 127,
        stdout: '',
        stderr: `Failed to execute command: ${cmd[0]}\nError: ${errorMessage}`,
      };
    }
  },

  /**
   * Retrieves the list of currently staged files, filtering out deleted files.
   */
  async getStagedFiles(rootDir: string): Promise<string[]> {
    // ACMR = Added, Copied, Modified, Renamed. We exclude D (Deleted).
    const { stdout, exitCode, stderr } = await Shell.exec(
      ['git', 'diff', '--name-only', '--cached', '--diff-filter=ACMR'],
      { cwd: rootDir },
    );

    if (exitCode !== 0) {
      UI.log(
        c.yellow(
          'Warning: Could not retrieve staged files. Is this a Git repository? Proceeding with full scan.',
        ),
      );
      UI.log(c.dim(stderr));
      return [];
    }

    return stdout.split('\n').filter(Boolean);
  },
};

// =============================================================================
// Configuration
// =============================================================================

const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Define file extensions for linting and formatting
const LINT_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const FORMAT_EXTS = [
  ...LINT_EXTS,
  '.json',
  '.md',
  '.html',
  '.css',
  '.yaml',
  '.yml',
];

/**
 * Optimization Helper: Determines the targets for a command.
 * If running in Husky mode, filters staged files by allowed extensions.
 * If no relevant files are staged, returns an empty array (skipping the check).
 * Otherwise, returns the default target (e.g., ".").
 */
const getTargets = (
  ctx: AppContext,
  extensions: string[],
  defaultTarget: string,
): string[] => {
  if (ctx.isHuskyHook && ctx.stagedFiles.length > 0) {
    const filtered = ctx.stagedFiles.filter((file) =>
      extensions.includes(path.extname(file)),
    );
    // If we have matching staged files, return them.
    if (filtered.length > 0) {
      return filtered;
    }
    // If staged files exist, but none match the extensions, we should run nothing.
    return [];
  }
  // Not a husky hook, or no files staged at all.
  return [defaultTarget];
};

const ALL_CHECKS: Check[] = [
  {
    name: 'ESLint',
    flag: '--no-lint',
    canFix: true,
    getCommand: (ctx, mode) => {
      const targets = getTargets(ctx, LINT_EXTS, '.');
      if (targets.length === 0) return null;

      const command = ['bunx', 'eslint', ...targets, '--max-warnings', '0'];
      if (mode === 'fix') {
        command.push('--fix');
      }
      return command;
    },
    tip: (c) =>
      `Run without ${c.bold('--no-fix')} to automatically fix issues.`,
  },
  {
    name: 'TypeScript',
    flag: '--no-types',
    canFix: false,
    // TypeScript generally needs the whole project context for accurate checking.
    getCommand: () => ['bunx', 'tsc', '--noEmit'],
    tip: () => 'Check TypeScript errors in your IDE or the console output.',
  },
  {
    name: 'Prettier',
    flag: '--no-format',
    canFix: true,
    getCommand: (ctx, mode) => {
      // We use '.' as the default target, assuming a .prettierignore file is present.
      const targets = getTargets(ctx, FORMAT_EXTS, '.');
      if (targets.length === 0) return null;

      const command = ['bunx', 'prettier'];
      if (mode === 'fix') {
        command.push('--write');
      } else {
        command.push('--check');
      }
      command.push(...targets);
      return command;
    },
    tip: (c) => `Run without ${c.bold('--no-fix')} to fix formatting.`,
  },
  {
    name: 'TODOs/FIXMEs',
    flag: '--no-todos',
    canFix: false,
    getCommand: (ctx) => {
      // git grep -n (line number) -E (extended regex) -i (case-insensitive)
      const baseCmd = ['git', 'grep', '-nEi', '\\b(TODO|FIXME)\\b'];
      if (ctx.isHuskyHook && ctx.stagedFiles.length > 0) {
        // Check only staged files in the working tree
        return [...baseCmd, '--', ...ctx.stagedFiles];
      }
      // Check the entire tracked repository (default behavior of git grep)
      return baseCmd;
    },
    // Custom success logic: git grep exits 0 if matches are found, 1 if none are found.
    // We want the opposite for this check.
    isSuccess: (result, _mode) => {
      if (result.exitCode === 0 && result.stdout) {
        return false; // Found TODOs, fail the check
      }
      // Exit code 1 often means no matches found (success). Other exit codes are errors.
      // We check that stderr is empty to distinguish "no match" from actual errors.
      return result.exitCode === 1 && !result.stderr;
    },
    tip: (c) =>
      `Resolve ${c.bold('TODO')} or ${c.bold('FIXME')} comments before committing.`,
  },
  {
    name: 'Security Audit',
    flag: '--no-audit',
    canFix: false, // 'bun audit --fix' exists but often requires manual review.
    getCommand: () => ['bun', 'audit'],
    isSuccess: (result, _mode) => {
      // If the command exits 0, no vulnerabilities were found.
      if (result.exitCode === 0) return true;

      // 'bun audit' exits with 1 if vulnerabilities are found. We need to check the output.
      const output = result.stdout;

      // If no vulnerabilities are found, it's a success (defensive check).
      if (output.includes('0 vulnerabilities found')) return true;

      // Fail only if 'high' or 'critical' vulnerabilities are mentioned.
      const hasHighOrCritical = /high|critical/i.test(output);

      // If it doesn't have high or critical vulnerabilities, we consider it a success.
      return !hasHighOrCritical;
    },
    tip: (c) =>
      `High- or critical-severity vulnerabilities found. Review the report and run ${c.bold('bun update')} or ${c.bold('bun audit --fix')}.`,
  },
  {
    name: 'Tracked Secrets',
    flag: '--no-secrets',
    canFix: false,
    // Check if common sensitive files are tracked by git.
    getCommand: () => ['git', 'ls-files', '*.env*', '.npmrc', '.netrc'],
    // Success if output is empty OR only contains '.env.example'.
    isSuccess: (result, _mode) => {
      if (result.exitCode !== 0) return false;
      const files = result.stdout.trim().split('\n').filter(Boolean);
      if (files.length === 0) return true;
      if (files.length === 1 && files[0] === '.env.example') return true;
      return false;
    },
    tip: (c) =>
      `Add sensitive files to ${c.bold('.gitignore')} and run ${c.bold('git rm --cached <file>')}.`,
  },
  {
    name: 'Dependencies (Outdated)',
    flag: '--no-deps',
    canFix: false,
    getCommand: () => ['bun', 'outdated'],
    isSuccess: (result, _mode) => {
      // `bun outdated` exits with 0 if no packages are outdated, which is a success.
      if (result.exitCode === 0 && result.stdout.trim() === '') {
        return true;
      }

      // It exits with a non-zero code if outdated packages are found.
      // Deliberately held packages are allowed to show as outdated:
      //   zod                       — patch-pinned (~) so JSON Schema emission stays stable across Zod 4 minors
      //   typescript                — typescript-eslint peers `<6.1.0`; TypeScript 7 is not yet supported
      //   @cloudflare/workers-types — 5.20260817.1+ declares a global `Buffer: any` that degrades every Node Buffer type
      const heldPackages = ['zod', 'typescript', '@cloudflare/workers-types'];
      const lines = result.stdout.trim().split('\n');
      const otherOutdated = lines.filter(
        (line) =>
          line.includes('|') && // Actual package lines contain pipes
          !heldPackages.some((pkg) => line.includes(`| ${pkg} `)) &&
          !line.includes('Package') && // Exclude header
          !line.includes('---'), // Exclude separator
      );

      // If no other packages are listed as outdated, the check passes.
      return otherOutdated.length === 0;
    },
    tip: (c) =>
      `Run ${c.bold('bun update')} to upgrade dependencies. zod, typescript, and @cloudflare/workers-types are deliberately held (see heldPackages above).`,
  },
];

// =============================================================================
// UI & Logging
// =============================================================================

const UI = {
  log: console.log,

  printHeader(ctx: AppContext) {
    let modeMessage: string;
    if (ctx.isHuskyHook) {
      const fileCount = ctx.stagedFiles.length;
      const mode = ctx.noFix ? 'Read-only' : 'Auto-fixing';
      modeMessage = c.magenta(
        `(Husky Hook: ${mode} - ${fileCount} file${fileCount === 1 ? '' : 's'} staged)`,
      );
    } else {
      modeMessage = ctx.noFix
        ? c.dim('(Read-only mode)')
        : c.magenta('(Auto-fixing mode)');
    }

    UI.log(
      `${c.bold('🚀 DevCheck: Kicking off comprehensive checks...')} ${modeMessage}\n`,
    );
  },

  printCheckStart(check: Check, command: string[], mode: UIMode) {
    UI.log(
      `${c.bold(c.blue('🔷'))} ${mode} ${c.yellow(check.name)}${c.blue('...')} `,
    );
    // Truncate the command if it's very long (e.g., many staged files)
    let commandStr = command.join(' ');
    if (commandStr.length > 150) {
      commandStr = commandStr.substring(0, 147) + '... (truncated)';
    }
    UI.log(c.dim(`   $ ${commandStr}\n`));
  },

  printSkipped(check: Check, reason: string) {
    UI.log(
      `${c.bold(c.yellow('🔶 Skipping ' + check.name + '...'))}${c.dim(` (${reason})`)}\n`,
    );
  },

  printCheckResult(result: CommandResult, _mode: UIMode) {
    const { checkName, exitCode, duration } = result;
    if (exitCode === 0) {
      UI.log(
        `${c.bold(c.green('✅'))} ${c.yellow(checkName)} ${c.green(
          `finished successfully in ${duration}ms.`,
        )}\n`,
      );
    } else {
      UI.log(
        `${c.bold(c.red('❌'))} ${c.yellow(checkName)} ${c.red(
          `failed (Code ${exitCode}) in ${duration}ms.`,
        )}\n`,
      );
    }
  },

  printSummary(results: CommandResult[], ctx: AppContext): boolean {
    UI.log(`\n${c.bold('📊 Checkup Summary:')}`);
    UI.log('------------------------------------------------');

    let overallSuccess = true;
    const failedChecks: Check[] = [];

    results.forEach((result) => {
      let status: string;
      if (result.skipped) {
        status = `${c.yellow('⚪ SKIPPED')}`;
      } else if (result.exitCode === 0) {
        status = `${c.green('✅ PASSED')}`;
      } else {
        status = `${c.red('❌ FAILED')}`;
        overallSuccess = false;
        const foundCheck = ALL_CHECKS.find(
          (check) => check.name === result.checkName,
        );
        if (foundCheck) failedChecks.push(foundCheck);
      }

      const durationStr = result.skipped ? '' : c.dim(`(${result.duration}ms)`);
      UI.log(`${c.bold(result.checkName.padEnd(25))} ${status} ${durationStr}`);

      // Display output only for failed checks
      if (result.exitCode !== 0 && !result.skipped) {
        // Stdout often contains the details of the failure (e.g., grep matches, outdated list)
        if (result.stdout) UI.log(c.dim(result.stdout.replace(/^/gm, '   | ')));
        // Stderr usually contains actual errors from the tool execution
        if (result.stderr) UI.log(c.red(result.stderr.replace(/^/gm, '   | ')));
        UI.log('');
      }
    });

    UI.log('------------------------------------------------');

    if (!overallSuccess) {
      // Show tips if auto-fixing was disabled OR if any failed check cannot be auto-fixed.
      if (ctx.noFix || failedChecks.some((check) => !check.canFix)) {
        UI.log(`\n${c.bold(c.cyan('💡 Tips & Actions:'))}`);
        failedChecks.forEach((check) => {
          if (check.tip) {
            UI.log(`   - ${c.bold(check.name)}: ${c.dim(check.tip(c))}`);
          }
        });
      }
      if (!ctx.noFix) {
        UI.log(
          `\n${c.yellow('⚠️ Note: Some issues may have been fixed automatically, but others require manual intervention.')}`,
        );
      }
    }

    return overallSuccess;
  },

  printFooter(success: boolean) {
    if (success) {
      UI.log(`\n${c.bold(c.green('🎉 All checks passed! Ship it!'))}`);
    } else {
      UI.log(
        `\n${c.bold(c.red('🛑 Found issues. Please review the output above.'))}`,
      );
    }
  },

  printError(error: unknown) {
    console.error(
      `${c.red('\nAn unexpected error occurred in the check script:')}`,
      error,
    );
  },
};

// =============================================================================
// Core Logic
// =============================================================================

/**
 * Parses CLI arguments and determines the initial run context.
 */
function parseArgs(
  args: string[],
): Omit<AppContext, 'rootDir' | 'stagedFiles'> {
  const flags = new Set<string>();
  let noFix = false;
  let isHuskyHook = false;

  for (const arg of args) {
    if (arg === '--no-fix') {
      noFix = true;
    } else if (arg === '--husky-hook') {
      // Flag used when invoking this script from a husky configuration
      isHuskyHook = true;
    } else if (arg.startsWith('--')) {
      flags.add(arg);
    }
  }

  // Also detect if running inside environment set by Husky
  if (process.env.HUSKY === '1' || process.env.GIT_PARAMS) {
    isHuskyHook = true;
  }

  return { flags, noFix, isHuskyHook };
}

async function runCheck(check: Check, ctx: AppContext): Promise<CommandResult> {
  const { name, getCommand, isSuccess } = check;
  const baseResult: CommandResult = {
    checkName: name,
    exitCode: 0,
    stdout: '',
    stderr: '',
    duration: 0,
    skipped: false,
  };

  // 1. Check for skip flag
  if (ctx.flags.has(check.flag)) {
    UI.printSkipped(check, `Flag ${check.flag} provided`);
    return { ...baseResult, skipped: true };
  }

  // 2. Determine command and mode
  const useFixCommand = !ctx.noFix && check.canFix;
  const runMode: RunMode = useFixCommand ? 'fix' : 'check';
  const uiMode: UIMode = useFixCommand ? 'Fixing' : 'Checking';

  const command = getCommand(ctx, runMode);

  // 3. Check if command generation resulted in no action (e.g., no relevant staged files)
  if (!command || command.length === 0) {
    UI.printSkipped(check, 'No relevant files to check');
    return { ...baseResult, skipped: true };
  }

  UI.printCheckStart(check, command, uiMode);

  // 4. Execute the command
  const startTime = Date.now();
  const result = await Shell.exec(command, { cwd: ctx.rootDir });
  const duration = Date.now() - startTime;

  const finalResult = { ...baseResult, ...result, duration };

  // 5. Determine success (using custom logic if provided)
  if (isSuccess) {
    const success = isSuccess(result, runMode);
    // If the custom logic says it failed, ensure the exit code is non-zero,
    // even if the command itself exited with 0 (e.g., 'bun outdated' with output).
    if (!success && finalResult.exitCode === 0) {
      finalResult.exitCode = 1;
    }
    // Conversely, if the custom logic says it succeeded, ensure the exit code is 0.
    // This handles cases like 'git grep' which exits 1 on no match (which we consider success).
    if (success && finalResult.exitCode !== 0) {
      finalResult.exitCode = 0;
    }
  }

  UI.printCheckResult(finalResult, uiMode);

  return finalResult;
}

/**
 * Handles the specific logic required for git pre-commit hooks, primarily re-staging
 * files that were modified by auto-fixers (like ESLint or Prettier).
 */
async function handleHuskyReStaging(ctx: AppContext) {
  // We only need to re-stage if auto-fixing was enabled.
  if (ctx.noFix) return;

  // If no files were staged initially, there's nothing to re-stage.
  if (ctx.stagedFiles.length === 0) return;

  UI.log(
    `\n${c.bold(c.cyan('✨ Husky: Checking for modifications by fixers...'))}`,
  );

  try {
    // Get the current status of the repository after fixers have run.
    const { stdout: gitStatus } = await Shell.exec(
      ['git', 'status', '--porcelain'],
      { cwd: ctx.rootDir },
    );

    // Identify files that have changes in both the index (staged) AND the working tree (modified by fixer).
    // Git porcelain status codes are two characters: XY path
    // X = Index status (e.g., M, A, R)
    // Y = Working Tree status (e.g., M)
    // We look for files where X is not ' ' (meaning it was staged/indexed) and Y is 'M' (meaning it was modified since staging).
    // Examples: 'MM' (Modified staged, then Modified again), 'AM' (Added staged, then Modified).
    const modifiedStagedFiles = gitStatus
      .split('\n')
      .filter(
        (line) =>
          line.length > 3 &&
          line[1] === 'M' && // Working tree is Modified
          line[0] !== ' ' && // Index has an entry
          line[0] !== '?', // Not untracked
      )
      .map((line) => line.substring(3).trim());

    if (modifiedStagedFiles.length > 0) {
      UI.log(
        c.yellow(
          `   Re-staging ${modifiedStagedFiles.length} files modified by fixers...`,
        ),
      );

      // Add the files back to the index in one command so the fixes are included in the commit.
      const cmd = ['git', 'add', ...modifiedStagedFiles];
      await Shell.exec(cmd, { cwd: ctx.rootDir });

      // Truncate command display if very long
      let cmdStr = cmd.join(' ');
      if (cmdStr.length > 100) {
        cmdStr = cmdStr.substring(0, 97) + '...';
      }
      UI.log(c.dim(`     $ ${cmdStr}`));
      UI.log(c.green('   ✓ Successfully re-staged files.'));
    } else {
      UI.log(c.green('   ✓ No staged files were modified by fixers.'));
    }
  } catch (error) {
    UI.log(
      c.red(
        '🛑 Error during Husky hook file management. Fixes might not be staged.',
      ),
    );
    UI.printError(error);
    // We must fail the commit if we couldn't re-stage the fixes.
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Initialize context
  const appContext: AppContext = {
    ...args,
    rootDir: ROOT_DIR,
    stagedFiles: [],
  };

  // If in husky mode, populate staged files early for optimized command generation.
  if (appContext.isHuskyHook) {
    appContext.stagedFiles = await Shell.getStagedFiles(ROOT_DIR);
  }

  // If it's a husky hook and nothing is staged, we can exit early.
  if (appContext.isHuskyHook && appContext.stagedFiles.length === 0) {
    // We rely on Shell.getStagedFiles printing a warning if it failed.
    // If it succeeded and returned 0 files, we print a success message.
    UI.log(c.green('\nNo files staged. Skipping pre-commit checks.'));
    process.exit(0);
  }

  UI.printHeader(appContext);

  // Run checks concurrently
  const checkPromises = ALL_CHECKS.map((check) => runCheck(check, appContext));
  const settledResults = await Promise.allSettled(checkPromises);

  // Process results
  const results: CommandResult[] = settledResults.map((res, index) => {
    if (res.status === 'fulfilled') {
      return res.value;
    } else {
      // This handles errors during the execution of runCheck itself, not just the shell command.
      const checkName = ALL_CHECKS[index]?.name || 'Unknown';
      UI.printError(`Error running check runner for: ${checkName}`);
      UI.printError(res.reason);
      return {
        checkName,
        exitCode: 1,
        stdout: '',
        stderr: `Check runner failed: ${String(res.reason)}`,
        duration: 0,
        skipped: false,
      };
    }
  });

  // If running in Husky hook, manage file staging.
  // We do this BEFORE summarizing success, so that even if checks failed, partial fixes are staged.
  if (appContext.isHuskyHook) {
    await handleHuskyReStaging(appContext);
  }

  const overallSuccess = UI.printSummary(results, appContext);

  UI.printFooter(overallSuccess);
  process.exit(overallSuccess ? 0 : 1);
}

// Entry point
main().catch((error) => {
  UI.printError(error);
  process.exit(1);
});
