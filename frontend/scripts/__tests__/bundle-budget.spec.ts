import { describe, expect, it } from 'vitest';
import { evaluateBundleBudgets } from '../check-bundle-budget.mjs';

describe('bundle budget', () => {
  it('passes on a small bundle', () => {
    const result = evaluateBundleBudgets([{ name: 'index.js', bytes: 100 * 1024 }]);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when the total exceeds its budget', () => {
    const result = evaluateBundleBudgets(
      [{ name: 'index.js', bytes: 3_000 * 1024 }],
      { total: 100, perChunk: 10_000, routes: {} },
    );
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].scope).toBe('total');
  });

  it('fails when a route chunk exceeds its budget', () => {
    const result = evaluateBundleBudgets(
      [{ name: 'reports-abc.js', bytes: 2_000 * 1024 }],
      { total: 10_000, perChunk: 10_000, routes: { reports: 100 } },
    );
    expect(result.violations.some((violation) => violation.scope === 'route:reports')).toBe(true);
  });
});
