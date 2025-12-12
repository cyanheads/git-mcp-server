/**
 * @fileoverview Runtime adapter for cross-runtime process spawning
 * @module services/git/providers/cli/utils/runtime-adapter
 *
 * This module provides a unified interface for spawning git processes
 * that works in both Bun and Node.js runtimes. When running via bunx
 * (Node.js), it uses cross-spawn for proper Windows PATH resolution.
 * When running in native Bun, it uses Bun.spawn for better performance.
 *
 * ## Why eslint-disable is necessary
 *
 * TypeScript cannot infer types for `globalThis.Bun` at compile time because:
 * 1. The Bun types are only available when running in Bun runtime
 * 2. This code must compile for both Node.js and Bun targets
 * 3. We must dynamically access `globalThis.Bun` and cast it
 *
 * We minimize unsafe code by:
 * - Creating a typed interface for only the Bun APIs we use
 * - Isolating the single `any` cast to the initial access
 * - Using TypeScript interfaces for all downstream usage
 */

import spawn from 'cross-spawn';

/**
 * Result of executing a git command.
 */
export interface GitCommandResult {
  /** Standard output from the command */
  stdout: string;
  /** Standard error from the command */
  stderr: string;
}

/**
 * Minimal typed interface for Bun's spawn API.
 *
 * This interface includes only the subset of Bun's API that we actually use,
 * providing type safety for the dynamic access to globalThis.Bun.
 *
 * @internal
 */
interface BunSpawnAPI {
  spawn(
    cmd: string[],
    options: {
      cwd: string;
      env: Record<string, string>;
      stdio: [string, string, string];
    },
  ): BunSubprocess;
}

/**
 * Bun extends ReadableStream with additional helper methods.
 * This interface represents Bun's enhanced ReadableStream.
 *
 * @internal
 */
interface BunReadableStream extends ReadableStream<Uint8Array> {
  /**
   * Bun-specific extension: Read the entire stream as text.
   * This is more efficient than using a TextDecoder manually.
   */
  text(): Promise<string>;
}

/**
 * Minimal typed interface for Bun's Subprocess.
 *
 * @internal
 */
interface BunSubprocess {
  readonly stdout: BunReadableStream;
  readonly stderr: BunReadableStream;
  readonly exited: Promise<number>;
  kill(): void;
}

/**
 * Detects the current JavaScript runtime.
 *
 * @returns 'bun' if running in Bun, 'node' if running in Node.js
 *
 * @example
 * ```typescript
 * const runtime = detectRuntime();
 * if (runtime === 'bun') {
 *   // Use Bun-specific APIs
 * } else {
 *   // Use Node.js APIs
 * }
 * ```
 */
export function detectRuntime(): 'bun' | 'node' {
  // Check for Bun global object (most reliable)
  if (typeof globalThis.Bun !== 'undefined') {
    return 'bun';
  }

  // Check process.versions.bun as fallback
  if (process.versions?.bun) {
    return 'bun';
  }

  return 'node';
}

/**
 * Spawns a git command using Bun.spawn for optimal performance.
 *
 * This function is used when running in native Bun runtime. It uses Bun's
 * native spawn API which provides better performance than Node's child_process.
 *
 * The function:
 * 1. Spawns the git process with piped stdout/stderr
 * 2. Races the process exit against a timeout and abort signal
 * 3. Reads streams using the standard ReadableStream.text() method
 * 4. Returns structured output or throws on error
 *
 * @param args - Git command arguments
 * @param cwd - Working directory
 * @param env - Environment variables
 * @param timeout - Timeout in milliseconds
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise resolving to stdout and stderr
 * @throws Error if the command fails, times out, or is aborted
 */
async function spawnWithBun(
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeout: number,
  signal?: AbortSignal,
): Promise<GitCommandResult> {
  // Cast globalThis.Bun to our typed interface
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bunApi = globalThis.Bun as any as BunSpawnAPI;

  // Check if already aborted before starting
  if (signal?.aborted) {
    throw new Error(
      `Git command cancelled before execution: git ${args.join(' ')}`,
    );
  }

  // Spawn the process using typed interface - no more eslint-disable needed
  const proc = bunApi.spawn(['git', ...args], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Create abort signal listener that kills the process
  const abortPromise = new Promise<never>((_, reject) => {
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          proc.kill();
          reject(new Error(`Git command cancelled: git ${args.join(' ')}`));
        },
        { once: true },
      );
    }
  });

  // Create a timeout promise that will kill the process if it exceeds the limit
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      proc.kill();
      reject(
        new Error(
          `Git command timed out after ${timeout / 1000}s: git ${args.join(' ')}`,
        ),
      );
    }, timeout);

    // Ensure timeout is cleared if process exits normally
    void proc.exited.finally(() => clearTimeout(timeoutId));
  });

  // Wait for the process to exit, racing against timeout and abort signal
  const exitCode = await Promise.race([
    proc.exited,
    timeoutPromise,
    ...(signal ? [abortPromise] : []),
  ]);

  // Read the output streams using standard ReadableStream.text() method
  // This is the modern Web Streams API approach
  const [stdout, stderr] = await Promise.all([
    proc.stdout.text(),
    proc.stderr.text(),
  ]);

  // Check if the command succeeded (exit code 0)
  if (exitCode !== 0) {
    const combinedOutput = `Exit Code: ${exitCode}\nStderr: ${stderr}\nStdout: ${stdout}`;
    throw new Error(combinedOutput);
  }

  return { stdout, stderr };
}

/**
 * Spawns a git command using Node.js child_process.spawn.
 *
 * This function is used when running via bunx or in Node.js runtime.
 *
 * @param args - Git command arguments
 * @param cwd - Working directory
 * @param env - Environment variables
 * @param timeout - Timeout in milliseconds
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise resolving to stdout and stderr
 * @throws Error if the command fails, times out, or is aborted
 */
async function spawnWithNode(
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeout: number,
  signal?: AbortSignal,
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    // Check if already aborted before starting
    if (signal?.aborted) {
      reject(
        new Error(`Git command cancelled before execution: ${args.join(' ')}`),
      );
      return;
    }

    const proc = spawn('git', args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // With stdio: ['ignore', 'pipe', 'pipe'], stdout/stderr are guaranteed non-null
    if (!proc.stdout || !proc.stderr) {
      reject(new Error('Failed to capture process streams'));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    // Setup abort signal handler
    const abortHandler = () => {
      proc.kill('SIGTERM');
      reject(new Error(`Git command cancelled: ${args.join(' ')}`));
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    // Setup timeout
    const timeoutHandle = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(
        new Error(
          `Git command timed out after ${timeout / 1000}s: ${args.join(' ')}`,
        ),
      );
    }, timeout);

    proc.on('error', (error) => {
      clearTimeout(timeoutHandle);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      reject(error);
    });

    proc.on('close', (exitCode) => {
      clearTimeout(timeoutHandle);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');

      if (exitCode !== 0) {
        const combinedOutput = `Exit Code: ${exitCode}\nStderr: ${stderr}\nStdout: ${stdout}`;
        reject(new Error(combinedOutput));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Spawns a git command using the appropriate runtime implementation.
 *
 * Automatically detects the runtime (Bun vs Node.js) and uses the
 * optimal process spawning method for that runtime.
 *
 * Supports cancellation via AbortSignal (MCP Spec 2025-06-18):
 * - Clients can cancel long-running operations by aborting the request
 * - The git process will be killed and resources cleaned up
 *
 * @param args - Git command arguments (e.g., ['status', '--porcelain'])
 * @param cwd - Working directory for command execution
 * @param env - Environment variables
 * @param timeout - Timeout in milliseconds (default: 60000)
 * @param signal - Optional AbortSignal for cancellation support
 * @returns Promise resolving to stdout and stderr
 * @throws Error if the command fails, times out, or is cancelled
 *
 * @example
 * ```typescript
 * const result = await spawnGitCommand(
 *   ['status', '--porcelain'],
 *   '/path/to/repo',
 *   { GIT_TERMINAL_PROMPT: '0' },
 *   60000,
 *   abortController.signal
 * );
 * console.log(result.stdout); // Git output
 * ```
 */
export async function spawnGitCommand(
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeout = 60000,
  signal?: AbortSignal,
): Promise<GitCommandResult> {
  const runtime = detectRuntime();

  if (runtime === 'bun') {
    return spawnWithBun(args, cwd, env, timeout, signal);
  } else {
    return spawnWithNode(args, cwd, env, timeout, signal);
  }
}
