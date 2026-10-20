import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allStates, COMPONENTS, STATE_COUNT } from '../state-manifest';

describe('State manifest matrix parity (T047, FR-060, FR-062, SC-001, SC-011)', () => {
  const specPath = resolve(__dirname, '../../../../../specs/004-frontend-shell/spec.md');
  const specContent = readFileSync(specPath, 'utf-8');

  it('matches all components in spec.md state matrix', () => {
    for (const comp of COMPONENTS) {
      // In spec.md, DataTable is written as "Data table" and DropdownMenu is written as "Dropdown menu"
      let searchPattern = comp;
      if (comp === 'DataTable') searchPattern = 'Data table';
      if (comp === 'DropdownMenu') searchPattern = 'Dropdown menu';

      expect(
        specContent.includes(`| ${searchPattern} |`),
        `Component ${comp} (${searchPattern}) from STATE_MANIFEST must exist in spec.md state matrix`,
      ).toBe(true);
    }
  });

  it('computes SC-001 and SC-011 percentages from manifest count', () => {
    const totalStates = STATE_COUNT;
    const states = allStates();
    expect(states.length).toBe(totalStates);

    // Compute coverage percentages:
    const fixturesCount = states.filter((s) => Boolean(s.entry.fixture)).length;
    const assertionsCount = states.filter((s) => Boolean(s.entry.assertion)).length;

    const fixturePercentage = (fixturesCount / totalStates) * 100;
    const assertionPercentage = (assertionsCount / totalStates) * 100;

    expect(fixturePercentage).toBe(100);
    expect(assertionPercentage).toBe(100);

    console.log(`[SC-001 / SC-011] Total states: ${totalStates}`);
    console.log(`[SC-001] Fixture coverage: ${fixturePercentage.toFixed(1)}%`);
    console.log(`[SC-011] Assertion coverage: ${assertionPercentage.toFixed(1)}%`);
  });
});
