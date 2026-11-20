import { describe, expect, it } from '@jest/globals';

import { canonicalJson, IdempotencyService } from '../idempotency.service';

/**
 * The request fingerprint (PRD 9.6).
 *
 * The fingerprint decides whether a repeated key is the SAME request (which is
 * replayed) or a DIFFERENT one (which is refused). A fingerprint that is too
 * coarse would replay the wrong answer; one that is too fine would refuse a
 * legitimate retry.
 */
describe('the idempotency request fingerprint', () => {
  const service = new IdempotencyService({} as never);

  it('is the same for the same body written with its keys in another order', () => {
    const first = service.hashRequest({ warehouseId: 'w1', productId: 'p1', quantity: '-2.000' });
    const second = service.hashRequest({ quantity: '-2.000', productId: 'p1', warehouseId: 'w1' });

    expect(first).toBe(second);
  });

  it('differs when any value differs', () => {
    const first = service.hashRequest({ warehouseId: 'w1', productId: 'p1', quantity: '-2.000' });
    const second = service.hashRequest({ warehouseId: 'w1', productId: 'p1', quantity: '-3.000' });

    expect(first).not.toBe(second);
  });

  it('differs when a key is added or removed', () => {
    const base = { warehouseId: 'w1', productId: 'p1' };

    expect(service.hashRequest(base)).not.toBe(service.hashRequest({ ...base, note: 'x' }));
    expect(service.hashRequest(base)).not.toBe(service.hashRequest({ warehouseId: 'w1' }));
  });

  it('keeps the order of an array, because an array of lines is ordered data', () => {
    expect(service.hashRequest({ lines: ['a', 'b'] })).not.toBe(
      service.hashRequest({ lines: ['b', 'a'] }),
    );
  });

  it('canonicalises nested objects too', () => {
    expect(canonicalJson({ b: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"b":{"c":2,"d":1}}');
  });

  it('is a hex digest, so the stored fingerprint is a fixed size', () => {
    expect(service.hashRequest({ any: 'body' })).toMatch(/^[a-f0-9]{64}$/);
  });
});
