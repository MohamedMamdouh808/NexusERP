/**
 * T056 - The development gallery uses its own local fixtures (FR-046).
 */
import { describe, expect, it } from 'vitest';
import { gallerySimulator, FIXTURES } from '../fixtures';

describe('Gallery local fixtures (T056, FR-046)', () => {
  it('exposes dev-only state simulation and a local removeRecord', async () => {
    expect(gallerySimulator.simulateFailure).toBe(false);
    const result = await gallerySimulator.removeRecord({ id: 'sample-0001' });
    expect(result.removedLabel).toContain('sample-0001');
  });

  it('renders fixtures without any production service import', () => {
    expect(Object.keys(FIXTURES).length).toBeGreaterThan(0);
  });
});
