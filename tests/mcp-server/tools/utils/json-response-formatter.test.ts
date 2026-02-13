/**
 * @fileoverview Unit tests for json-response-formatter
 * @module tests/mcp-server/tools/utils/json-response-formatter.test
 */
import { describe, it, expect } from 'vitest';

import {
  createJsonFormatter,
  shouldInclude,
  filterByVerbosity,
  mergeFilters,
  type VerbosityLevel,
} from '@/mcp-server/tools/utils/json-response-formatter.js';

interface TestOutput {
  [key: string]: unknown;
  success: boolean;
  summary: string;
  details: string[];
  metadata: { count: number };
}

describe('createJsonFormatter', () => {
  it('formats a result as JSON content blocks', () => {
    const formatter = createJsonFormatter<TestOutput>();
    const content = formatter({
      success: true,
      summary: 'done',
      details: ['a', 'b'],
      metadata: { count: 2 },
    });

    expect(content).toHaveLength(1);
    expect(content[0]!.type).toBe('text');
    const parsed = JSON.parse((content[0] as { text: string }).text);
    expect(parsed.success).toBe(true);
    expect(parsed.summary).toBe('done');
  });

  it('applies filter function when provided', () => {
    const filter = (data: TestOutput, level: VerbosityLevel) => {
      if (level === 'minimal') {
        return { success: data.success, summary: data.summary };
      }
      return data;
    };

    const formatter = createJsonFormatter<TestOutput>({
      filter,
      verbosity: 'minimal',
    });
    const content = formatter({
      success: true,
      summary: 'done',
      details: ['a'],
      metadata: { count: 1 },
    });

    const parsed = JSON.parse((content[0] as { text: string }).text);
    expect(parsed.success).toBe(true);
    expect(parsed.summary).toBe('done');
    expect(parsed.details).toBeUndefined();
    expect(parsed.metadata).toBeUndefined();
  });

  it('handles empty objects', () => {
    const formatter = createJsonFormatter<Record<string, never>>();
    const content = formatter({});
    const parsed = JSON.parse((content[0] as { text: string }).text);
    expect(parsed).toEqual({});
  });

  it('handles arrays in output', () => {
    const formatter = createJsonFormatter<{ items: string[] }>();
    const content = formatter({ items: ['a', 'b', 'c'] });
    const parsed = JSON.parse((content[0] as { text: string }).text);
    expect(parsed.items).toEqual(['a', 'b', 'c']);
  });

  it('handles null values', () => {
    const formatter = createJsonFormatter<{ value: string | null }>();
    const content = formatter({ value: null });
    const parsed = JSON.parse((content[0] as { text: string }).text);
    expect(parsed.value).toBeNull();
  });
});

describe('shouldInclude', () => {
  it('includes minimal in all levels', () => {
    expect(shouldInclude('minimal', 'minimal')).toBe(true);
    expect(shouldInclude('standard', 'minimal')).toBe(true);
    expect(shouldInclude('full', 'minimal')).toBe(true);
  });

  it('includes standard in standard and full', () => {
    expect(shouldInclude('minimal', 'standard')).toBe(false);
    expect(shouldInclude('standard', 'standard')).toBe(true);
    expect(shouldInclude('full', 'standard')).toBe(true);
  });

  it('includes full only in full', () => {
    expect(shouldInclude('minimal', 'full')).toBe(false);
    expect(shouldInclude('standard', 'full')).toBe(false);
    expect(shouldInclude('full', 'full')).toBe(true);
  });
});

describe('filterByVerbosity', () => {
  it('returns only specified fields for each level', () => {
    const filter = filterByVerbosity<TestOutput>({
      minimal: ['success'],
      standard: ['success', 'summary'],
      full: '*',
    });

    const data: TestOutput = {
      success: true,
      summary: 'done',
      details: ['a'],
      metadata: { count: 1 },
    };

    const minimal = filter(data, 'minimal');
    expect(Object.keys(minimal)).toEqual(['success']);

    const standard = filter(data, 'standard');
    expect(Object.keys(standard)).toEqual(['success', 'summary']);

    const full = filter(data, 'full');
    expect(full).toEqual(data);
  });
});

describe('mergeFilters', () => {
  it('composes multiple filters sequentially', () => {
    const addFlag = (data: any, _level: VerbosityLevel) => ({
      ...data,
      flagged: true,
    });
    const removeDetails = (data: any, _level: VerbosityLevel) => {
      const { details, ...rest } = data;
      return rest;
    };

    const merged = mergeFilters<TestOutput>([addFlag, removeDetails]);

    const result = merged(
      {
        success: true,
        summary: 'test',
        details: ['x'],
        metadata: { count: 1 },
      },
      'standard',
    );

    expect((result as any).flagged).toBe(true);
    expect((result as any).details).toBeUndefined();
  });
});
