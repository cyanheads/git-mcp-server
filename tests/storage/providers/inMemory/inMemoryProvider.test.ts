/**
 * @fileoverview Unit and compliance tests for the InMemoryProvider implementation.
 * @module tests/storage/providers/inMemory/inMemoryProvider.test
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { InMemoryProvider } from '@/storage/providers/inMemory/inMemoryProvider.js';
import { requestContextService } from '@/utils/index.js';

import { storageProviderTests } from '../../storageProviderCompliance.test.js';

const createTestContext = () =>
  requestContextService.createRequestContext({
    operation: 'in-memory-provider-test',
  });

describe('InMemoryProvider (unit)', () => {
  let provider: InMemoryProvider;
  const tenantId = 'tenant-a';

  let nowSpy: ReturnType<typeof vi.fn> | undefined;
  let now = 0;

  beforeEach(() => {
    provider = new InMemoryProvider();
    now = Date.now();
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy?.mockRestore();
  });

  it('evicts entries that have passed their ttl', async () => {
    const context = createTestContext();
    await provider.set(tenantId, 'ephemeral', 'value', context, { ttl: 1 });

    const immediate = await provider.get(tenantId, 'ephemeral', context);
    expect(immediate).toBe('value');

    now += 1_100;
    const afterExpiry = await provider.get(tenantId, 'ephemeral', context);
    expect(afterExpiry).toBeNull();
  });

  it('removes expired entries lazily during list operations', async () => {
    const context = createTestContext();
    await provider.set(tenantId, 'prefix:active', 'active', context, {
      ttl: 5,
    });
    await provider.set(tenantId, 'prefix:expired', 'expired', context, {
      ttl: 1,
    });

    now += 1_100;
    const result = await provider.list(tenantId, 'prefix:', context);
    expect(result.keys).toEqual(['prefix:active']);

    const expiredValue = await provider.get(
      tenantId,
      'prefix:expired',
      context,
    );
    expect(expiredValue).toBeNull();
  });

  it('isolates data between tenants', async () => {
    const context = createTestContext();
    await provider.set('tenant-a', 'shared-key', 'value-a', context);
    await provider.set('tenant-b', 'shared-key', 'value-b', context);

    const tenantAValue = await provider.get('tenant-a', 'shared-key', context);
    const tenantBValue = await provider.get('tenant-b', 'shared-key', context);

    expect(tenantAValue).toBe('value-a');
    expect(tenantBValue).toBe('value-b');
  });
});

// Run the generic compliance suite to ensure contract compatibility
storageProviderTests(() => new InMemoryProvider(), 'InMemoryProvider');
