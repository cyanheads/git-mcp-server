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
 * Whether commits and tags should be signed by default. Controlled by
 * GIT_SIGN_COMMITS — the same setting governs both, matching how most
 * signing workflows are configured (one GPG/SSH identity signs everything).
 * Per-call overrides are available through each tool's `sign` parameter.
 * Returns false if config is unavailable.
 */
export function shouldSignCommits(): boolean {
  return loadConfig()?.git?.signCommits ?? false;
}
