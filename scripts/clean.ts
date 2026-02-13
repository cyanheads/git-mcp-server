#!/usr/bin/env node
/**
 * @fileoverview Utility script to clean build artifacts and temporary directories.
 * @module scripts/clean
 *   By default, it removes the 'dist' and 'logs' directories.
 *   Custom directories can be specified as command-line arguments.
 *   Works on all platforms using Node.js path normalization.
 *
 * @example
 * // Add to package.json:
 * // "scripts": {
 * //   "clean": "ts-node --esm scripts/clean.ts",
 * //   "rebuild": "bun run clean && bun run build"
 * // }
 *
 * // Run with default directories:
 * // bun run clean
 *
 * // Run with custom directories:
 * // ts-node --esm scripts/clean.ts temp coverage
 */
import { access, rm } from 'fs/promises';
import { join } from 'path';

/**
 * Represents the result of a clean operation for a single directory.
 * @property dir - The name of the directory targeted for cleaning.
 * @property status - Indicates if the cleaning was successful or skipped.
 * @property reason - If skipped, the reason why.
 */
interface CleanResult {
  dir: string;
  status: 'success' | 'skipped';
  reason?: string;
}

/**
 * Asynchronously checks if a directory exists at the given path.
 * @param dirPath - The absolute or relative path to the directory.
 * @returns A promise that resolves to `true` if the directory exists, `false` otherwise.
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main function to perform the cleaning operation.
 * It reads command line arguments for target directories or uses defaults ('dist', 'logs').
 * Reports the status of each cleaning attempt.
 */
const clean = async (): Promise<void> => {
  try {
    let dirsToClean: string[] = ['dist', 'logs', 'coverage'];
    const args = process.argv.slice(2);

    if (args.length > 0) {
      dirsToClean = args;
    }

    console.log(`Attempting to clean directories: ${dirsToClean.join(', ')}`);

    const results = await Promise.allSettled(
      dirsToClean.map(async (dir): Promise<CleanResult> => {
        const dirPath = join(process.cwd(), dir);

        const exists = await directoryExists(dirPath);

        if (!exists) {
          return { dir, status: 'skipped', reason: 'does not exist' };
        }

        await rm(dirPath, { recursive: true, force: true });
        return { dir, status: 'success' };
      }),
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { dir, status, reason } = result.value;
        if (status === 'success') {
          console.log(`Successfully cleaned directory: ${dir}`);
        } else {
          console.log(`Skipped cleaning directory ${dir}: ${reason}.`);
        }
      } else {
        // The error here is the actual error object from the rejected promise
        console.error(
          `Error cleaning a directory (details below):\n`,
          result.reason,
        );
      }
    });
  } catch (error) {
    console.error(
      'An unexpected error occurred during the clean script execution:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
};

// Intentionally not awaiting; internal try/catch handles errors.
void clean();
