/**
 * The contract of the service interface (T015).
 *
 * This suite is written against `CatalogService` - the interface - rather than
 * against the sample implementation's internals, because that is the thing the
 * components depend on and the thing the real REST client must also satisfy
 * (FR-036, FR-037). The sample implementation is what runs it today.
 *
 * Four claims the spec makes about the seam are checked here and nowhere else:
 *
 *  - a list returns a page AND the total of the whole set, never the page's own
 *    length (FR-025);
 *  - a mutation resolves without presenting a committed record (Principle III,
 *    FR-037);
 *  - nothing is written to browser storage, so a reload cannot look like a saved
 *    change (FR-068);
 *  - the simulated failure is the same shape as a real one, down to the shared
 *    rate-limit rule the health panel uses (FR-069, research.md R-007).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ERROR_CODES, ERROR_CODE_STATUS } from '@nexuserp/shared';

import { isRateLimited } from '../../lib/api-client';
import { SAMPLE_RECORDS } from '../../mocks/sample-data';
import type { CatalogService } from '../catalog-service';
import { SampleServiceFailure, sampleCatalogService } from '../sample-catalog-service';

/**
 * The compile-time half of the contract. If the sample implementation drifts
 * from the interface this file stops building; every test below then calls
 * through `service`, so the assignment is also the one that is exercised.
 */
const service: CatalogService = sampleCatalogService;

/**
 * Runs an operation that must reject and returns the rejection, asserted to be
 * the shared failure shape. Written as a helper rather than a bare `catch` so
 * "it rejected at all" is a failure and not a silently skipped expectation.
 */
async function capture(operation: () => Promise<unknown>): Promise<SampleServiceFailure> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(SampleServiceFailure);
    return error as SampleServiceFailure;
  }

  throw new Error('expected the call to reject, but it resolved');
}

/** Everything this feature could persist to, as one comparable value. */
function storageSnapshot(): string {
  return JSON.stringify({
    cookie: document.cookie,
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage).sort(),
  });
}

beforeEach(() => {
  // A reload-equivalent: the initial rows and switches come back, which is only
  // true because nothing the previous case did was persisted.
  sampleCatalogService.reset();
});

describe('CatalogService contract - list', () => {
  it('returns a page and the total of the whole set, not the page length (FR-025)', async () => {
    const first = await service.listRecords({ page: 1, pageSize: 5 });
    expect(first.items).toHaveLength(5);
    expect(first.total).toBe(SAMPLE_RECORDS.length);

    const last = await service.listRecords({ page: 3, pageSize: 5 });
    expect(last.items).toHaveLength(2);
    expect(last.total).toBe(SAMPLE_RECORDS.length);
  });

  it('orders money by value rather than as text (Principle IV, FR-039)', async () => {
    const ascending = await service.listRecords({ page: 1, pageSize: 12, sort: 'amount' });

    // '96.00' sorts after '4300.00' as text; numeric ordering puts the largest
    // amount last and the zero first.
    expect(ascending.items[ascending.items.length - 1].amount).toBe('4300.00');
    expect(ascending.items[0].amount).toBe('0.00');
  });
});

describe('CatalogService contract - detail', () => {
  it('returns one record, with money still a decimal string', async () => {
    const record = await service.getRecord('sample-0001');

    expect(record).toEqual(SAMPLE_RECORDS[0]);
    expect(typeof record.amount).toBe('string');
  });

  it('rejects an unknown identifier with the shared NOT_FOUND code (FR-037)', async () => {
    const failure = await capture(() => service.getRecord('sample-does-not-exist'));

    expect(failure.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(failure.status).toBe(ERROR_CODE_STATUS[ERROR_CODES.NOT_FOUND]);
  });
});

describe('CatalogService contract - mutation', () => {
  it('resolves with a label and never with the removed record (Principle III, FR-037)', async () => {
    const result = await service.removeRecord({ id: 'sample-0002' });

    expect(Object.keys(result)).toEqual(['removedLabel']);
    expect(result.removedLabel).toBe('Pallet wrapping film');
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('amount');

    await expect(service.getRecord('sample-0002')).rejects.toBeInstanceOf(SampleServiceFailure);
  });

  it('changes only the in-memory store - reset restores the removed row (FR-068)', async () => {
    await service.removeRecord({ id: 'sample-0002' });

    sampleCatalogService.reset();

    await expect(service.getRecord('sample-0002')).resolves.toMatchObject({
      id: 'sample-0002',
      amount: '384.50',
    });
  });

  it('writes nothing to browser storage (FR-068)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const before = storageSnapshot();

    await service.listRecords({ page: 1, pageSize: 5 });
    await service.getRecord('sample-0001');
    await service.removeRecord({ id: 'sample-0001' });

    expect(setItem).not.toHaveBeenCalled();
    expect(storageSnapshot()).toBe(before);
  });
});

describe('CatalogService contract - simulated failure (FR-069)', () => {
  it('produces a rejection the shared rate-limit rule recognises (research.md R-007)', async () => {
    sampleCatalogService.simulateFailure = true;
    sampleCatalogService.failureKind = 'rate-limit';

    const failure = await capture(() => service.listRecords({ page: 1, pageSize: 5 }));

    expect(failure.code).toBe(ERROR_CODES.TOO_MANY_REQUESTS);
    expect(failure.status).toBe(ERROR_CODE_STATUS[ERROR_CODES.TOO_MANY_REQUESTS]);
    expect(failure.retryAfterSeconds).toBe(30);
    expect(failure.requestId).not.toBe('');
    expect(isRateLimited(failure)).toBe(true);
  });

  it('produces a generic failure that is not mistaken for a rate limit', async () => {
    sampleCatalogService.simulateFailure = true;
    sampleCatalogService.failureKind = 'error';

    const failure = await capture(() => service.listRecords({ page: 1, pageSize: 5 }));

    expect(failure.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(failure.status).toBe(ERROR_CODE_STATUS[ERROR_CODES.INTERNAL_ERROR]);
    expect(failure.retryAfterSeconds).toBeNull();
    expect(isRateLimited(failure)).toBe(false);
  });

  it('delays rather than fails when the slow-response switch is on', async () => {
    vi.useFakeTimers();
    try {
      sampleCatalogService.simulateSlowResponse = true;

      const pending = service.listRecords({ page: 1, pageSize: 5 });
      await vi.advanceTimersByTimeAsync(600);
      const page = await pending;

      expect(page.items).toHaveLength(5);
      expect(page.total).toBe(SAMPLE_RECORDS.length);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CatalogService contract - call log (FR-071)', () => {
  it('records every call, including one that rejected, with a monotonic sequence', async () => {
    await service.listRecords({ page: 1, pageSize: 5 });
    await service.getRecord('sample-0001');

    sampleCatalogService.simulateFailure = true;
    await capture(() => service.listRecords({ page: 1, pageSize: 5 }));

    sampleCatalogService.simulateFailure = false;
    await service.removeRecord({ id: 'sample-0002' });

    expect(sampleCatalogService.calls.map((call) => call.operation)).toEqual([
      'listRecords',
      'getRecord',
      'listRecords',
      'removeRecord',
    ]);
    expect(sampleCatalogService.calls.map((call) => call.sequence)).toEqual([1, 2, 3, 4]);
  });

  it('starts empty again after a reset', () => {
    expect(sampleCatalogService.calls).toHaveLength(0);
  });
});
