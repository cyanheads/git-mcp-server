/**
 * @fileoverview Unit tests for withToolAuth and withResourceAuth HOFs
 * @module tests/mcp-server/transports/auth/lib/withAuth.test
 */
import { describe, it, expect, vi } from 'vitest';

import {
  withToolAuth,
  withResourceAuth,
} from '@/mcp-server/transports/auth/lib/withAuth.js';
import type { RequestContext } from '@/utils/index.js';
import type { SdkContext } from '@/mcp-server/tools/utils/toolDefinition.js';

// withRequiredScopes defaults to allowed when no auth context exists,
// so these tests verify the wrapper behavior without needing auth setup.

describe('withToolAuth', () => {
  const mockContext = { requestId: 'test-id' } as RequestContext;
  const mockSdkContext = { sessionId: 'test-session' } as SdkContext;

  it('wraps a sync logic function and returns an async function', async () => {
    const logic = vi.fn(
      (_input: { path: string }, _ctx: RequestContext, _sdk: SdkContext) => ({
        result: 'ok',
      }),
    );

    const wrapped = withToolAuth(['tool:git:read'], logic);
    const result = await wrapped({ path: '.' }, mockContext, mockSdkContext);

    expect(result).toEqual({ result: 'ok' });
    expect(logic).toHaveBeenCalledWith(
      { path: '.' },
      mockContext,
      mockSdkContext,
    );
  });

  it('wraps an async logic function', async () => {
    const logic = vi.fn(async () => ({ async: true }));

    const wrapped = withToolAuth(['tool:git:write'], logic);
    const result = await wrapped({}, mockContext, mockSdkContext);

    expect(result).toEqual({ async: true });
  });

  it('passes through errors from logic function', async () => {
    const logic = vi.fn(() => {
      throw new Error('logic error');
    });

    const wrapped = withToolAuth(['tool:git:read'], logic);
    await expect(wrapped({}, mockContext, mockSdkContext)).rejects.toThrow(
      'logic error',
    );
  });
});

describe('withResourceAuth', () => {
  const mockContext = { requestId: 'test-id' } as RequestContext;

  it('wraps a sync resource logic function', async () => {
    const logic = vi.fn((_uri: URL, _params: object, _ctx: RequestContext) => ({
      data: 'resource',
    }));

    const wrapped = withResourceAuth(['resource:git:read'], logic);
    const uri = new URL('git://working-directory');
    const result = await wrapped(uri, {}, mockContext);

    expect(result).toEqual({ data: 'resource' });
    expect(logic).toHaveBeenCalledWith(uri, {}, mockContext);
  });

  it('wraps an async resource logic function', async () => {
    const logic = vi.fn(async () => ({ async: true }));

    const wrapped = withResourceAuth(['resource:git:read'], logic);
    const result = await wrapped(
      new URL('git://working-directory'),
      {},
      mockContext,
    );

    expect(result).toEqual({ async: true });
  });
});
