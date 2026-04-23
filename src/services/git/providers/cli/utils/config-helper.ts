/**
 * @fileoverview Helper utilities for loading git configuration
 * @module services/git/providers/cli/utils/config-helper
 */

import type { AppConfig } from '@/config/index.js';

/**
 * Safely load the application config.
 * Uses dynamic require to avoid circular dependencies.
 *
 * @returns AppConfig object or null if unavailable
 */
export function loadConfig(): AppConfig | null {
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
 * Whether commits and tags should be signed. Governed by `GIT_SIGN_COMMITS`
 * — the single switch for all signing operations in the server (commits,
 * tags, merges, rebases, cherry-picks). When enabled, operations attempt
 * to sign and fall back to unsigned silently on failure, surfacing the
 * fallback via the `signed` and `signingWarning` fields in the response.
 * Returns false if config is unavailable.
 */
export function shouldSignCommits(): boolean {
  return loadConfig()?.git?.signCommits ?? false;
}
