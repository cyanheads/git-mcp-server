/**
 * JSON response formatter utilities for LLM-optimized tool responses.
 * Provides structured JSON output with configurable verbosity levels.
 *
 * IMPORTANT: Verbosity levels control which FIELDS are included, not array truncation.
 * LLMs require complete context - never truncate arrays. If size is a concern,
 * omit entire arrays at lower verbosity levels rather than truncating them.
 */

import { config } from '@/config/index.js';
import { countTokens } from '@/utils/metrics/tokenCounter.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// Types
// ============================================================================

export type VerbosityLevel = 'minimal' | 'standard' | 'full';
export type ResponseFormat = 'json' | 'markdown' | 'auto';

export interface JsonFormatterOptions<T = unknown> {
  verbosity?: VerbosityLevel;
  filter?: (data: T, level: VerbosityLevel) => Partial<T> | T;
  prettyPrint?: boolean;
  replacer?: (key: string, value: unknown) => unknown;
  debug?: boolean;
  memoize?: boolean;
}

// ============================================================================
// Internal Utilities
// ============================================================================

class JsonFormatterError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'JsonFormatterError';
  }
}

function detectCircularReference(
  obj: unknown,
  seen = new WeakSet<object>(),
  path = 'root',
): string | null {
  if (obj === null || typeof obj !== 'object') return null;
  if (seen.has(obj)) return path;

  seen.add(obj);

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = detectCircularReference(obj[i], seen, `${path}[${i}]`);
      if (result) return result;
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      const result = detectCircularReference(value, seen, `${path}.${key}`);
      if (result) return result;
    }
  }

  return null;
}

function defaultReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (value === undefined) return null;
  if (typeof value === 'function') return undefined;
  return value;
}

function safeJsonStringify(
  data: unknown,
  replacer?: (key: string, value: unknown) => unknown,
  indent?: number,
): string {
  const circularPath = detectCircularReference(data);
  if (circularPath) {
    throw new JsonFormatterError(
      `Circular reference detected at: ${circularPath}`,
    );
  }

  const combinedReplacer = (key: string, value: unknown) => {
    const processed = defaultReplacer(key, value);
    return replacer ? replacer(key, processed) : processed;
  };

  try {
    return JSON.stringify(data, combinedReplacer, indent);
  } catch (error) {
    throw new JsonFormatterError(
      'Failed to serialize to JSON',
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Estimate token count for a string using the proper tokenCounter utility.
 * This is a wrapper that makes the async countTokens function usable in
 * synchronous contexts (debug logging). For production use, prefer the
 * async countTokens function directly.
 */
function estimateTokenCount(text: string): number {
  // Quick synchronous approximation for debug output only
  // For accurate counts, use countTokens() from @/utils/metrics/tokenCounter
  const normalized = text.replace(/\s+/g, ' ').trim();
  return Math.ceil(normalized.length / 4);
}

// ============================================================================
// Core Formatter
// ============================================================================

/**
 * Creates a JSON response formatter with optional verbosity filtering.
 *
 * @example
 * const formatter = createJsonFormatter({
 *   filter: (data, level) => level === 'minimal'
 *     ? { success: data.success }
 *     : data
 * });
 */
export function createJsonFormatter<T>(
  options?: JsonFormatterOptions<T>,
): (result: T) => ContentBlock[] {
  const {
    verbosity = config.mcpResponseVerbosity,
    filter,
    prettyPrint = true,
    replacer,
    debug = false,
    memoize = false,
  } = options || {};

  const cache = memoize ? new Map<string, string>() : null;

  return (result: T): ContentBlock[] => {
    const startTime = debug ? Date.now() : 0;

    try {
      const filteredResult = filter ? filter(result, verbosity) : result;

      // Generate cache key once (if caching enabled)
      let cacheKey: string | null = null;
      if (cache) {
        try {
          cacheKey = JSON.stringify({ result: filteredResult, verbosity });
          const cached = cache.get(cacheKey);
          if (cached) {
            if (debug && process.stderr?.isTTY) {
              console.log('[JsonFormatter] Cache hit');
            }
            return [{ type: 'text', text: cached }];
          }
        } catch {
          // Cache key gen failed, continue without caching
          cacheKey = null;
        }
      }

      const jsonString = safeJsonStringify(
        filteredResult,
        replacer,
        prettyPrint ? 2 : 0,
      );

      // Store in cache (if key was successfully generated)
      if (cache && cacheKey) {
        cache.set(cacheKey, jsonString);
      }

      if (debug && process.stderr?.isTTY) {
        const elapsed = Date.now() - startTime;
        console.log(
          `[JsonFormatter] ${elapsed}ms, ~${estimateTokenCount(jsonString)} tokens`,
        );
      }

      return [{ type: 'text', text: jsonString }];
    } catch (error) {
      const errorMessage =
        error instanceof JsonFormatterError
          ? error.message
          : 'Unknown formatting error';

      if (debug && process.stderr?.isTTY) {
        console.error('[JsonFormatter] Error:', error);
      }

      return [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'JSON_FORMATTING_ERROR',
              message: errorMessage,
              verbosity,
            },
            null,
            prettyPrint ? 2 : 0,
          ),
        },
      ];
    }
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a filter that includes/excludes fields by verbosity level.
 *
 * @example
 * const filter = filterByVerbosity({
 *   minimal: ['success', 'id'],
 *   standard: ['success', 'id', 'files'],
 *   full: '*'
 * });
 */
export function filterByVerbosity<T extends Record<string, unknown>>(config: {
  minimal: (keyof T)[] | '*';
  standard: (keyof T)[] | '*';
  full: (keyof T)[] | '*';
}): (data: T, level: VerbosityLevel) => Partial<T> | T {
  return (data: T, level: VerbosityLevel) => {
    const fields = config[level];
    if (fields === '*') return data;

    const filtered: Partial<T> = {};
    for (const field of fields) {
      if (field in data) filtered[field] = data[field];
    }
    return filtered;
  };
}

/**
 * Check if a field should be included at given verbosity level.
 *
 * NOTE: This helper is for determining which FIELDS to include, not for
 * truncating array contents. If an array is too large, omit the entire
 * field at lower verbosity levels rather than truncating the array.
 *
 * @example
 * ```typescript
 * // GOOD: Omit entire field at lower verbosity
 * const filter = (data, level) => ({
 *   success: data.success,
 *   ...(shouldInclude(level, 'standard') && { commits: data.commits })
 * });
 *
 * // BAD: Don't truncate arrays
 * // commits: data.commits.slice(0, 10)  // ❌ LLM loses context
 * ```
 */
export function shouldInclude(
  level: VerbosityLevel,
  minLevel: VerbosityLevel,
): boolean {
  const levels: VerbosityLevel[] = ['minimal', 'standard', 'full'];
  return levels.indexOf(level) >= levels.indexOf(minLevel);
}

/**
 * Compose multiple filter functions together.
 */
export function mergeFilters<T>(
  filters: Array<(data: T, level: VerbosityLevel) => Partial<T> | T>,
): (data: T, level: VerbosityLevel) => Partial<T> | T {
  return (data: T, level: VerbosityLevel) => {
    let result: Partial<T> | T = data;
    for (const filter of filters) {
      result = filter(result as T, level);
    }
    return result;
  };
}

/**
 * Create a field mapper that transforms/renames fields.
 */
export function createFieldMapper<T, R = Partial<T>>(mapping: {
  [K in keyof R]: (data: T, level: VerbosityLevel) => R[K];
}): (data: T, level: VerbosityLevel) => R {
  return (data: T, level: VerbosityLevel) => {
    const result = {} as R;
    for (const [key, transform] of Object.entries(mapping)) {
      result[key as keyof R] = (
        transform as (data: T, level: VerbosityLevel) => R[keyof R]
      )(data, level);
    }
    return result;
  };
}

/**
 * Create a conditional filter based on runtime conditions.
 */
export function createConditionalFilter<T>(
  condition: (data: T) => boolean,
  trueFilter: (data: T, level: VerbosityLevel) => Partial<T> | T,
  falseFilter: (data: T, level: VerbosityLevel) => Partial<T> | T,
): (data: T, level: VerbosityLevel) => Partial<T> | T {
  return (data: T, level: VerbosityLevel) =>
    condition(data) ? trueFilter(data, level) : falseFilter(data, level);
}

/**
 * Calculate compression ratio between verbosity levels.
 * Uses the proper token counting utility for accurate estimates.
 */
export async function calculateCompressionRatio<T>(
  data: T,
  filter?: (data: T, level: VerbosityLevel) => Partial<T> | T,
): Promise<{
  minimal: number;
  standard: number;
  full: number;
  minimalSavings: number;
  standardSavings: number;
}> {
  const levels: VerbosityLevel[] = ['minimal', 'standard', 'full'];
  const tokens = {} as Record<VerbosityLevel, number>;

  for (const level of levels) {
    const filtered = filter ? filter(data, level) : data;
    const jsonString = JSON.stringify(filtered);
    tokens[level] = await countTokens(jsonString);
  }

  return {
    minimal: tokens.minimal,
    standard: tokens.standard,
    full: tokens.full,
    minimalSavings: Math.round(
      ((tokens.full - tokens.minimal) / tokens.full) * 100,
    ),
    standardSavings: Math.round(
      ((tokens.full - tokens.standard) / tokens.full) * 100,
    ),
  };
}

/**
 * Default JSON formatter (no verbosity filtering).
 */
export const defaultJsonFormatter = createJsonFormatter();
