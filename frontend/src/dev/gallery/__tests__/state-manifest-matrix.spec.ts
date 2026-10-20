import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allStates, COMPONENTS, STATE_COUNT, STATE_MANIFEST } from '../state-manifest';

describe('State manifest matrix parity (T047, FR-060, FR-062, SC-001, SC-011)', () => {
  const specPath = resolve(__dirname, '../../../../../specs/004-frontend-shell/spec.md');
  const specContent = readFileSync(specPath, 'utf-8');
  const aliases: Record<string, string> = {
    'with help text': 'with-help-text',
    'invalid, with inline error': 'invalid',
    'selected value': 'selected-value',
    'loading, as skeleton rows': 'loading',
    'a page after the first': 'page-after-the-first',
    'status conveyed by more than colour': 'conveys-more-than-colour',
    'title only': 'title-only',
    'open, non-destructive': 'open-non-destructive',
    'open, destructive': 'open-destructive',
    'entry unavailable, with its reason': 'entry-unavailable',
    'reduced motion': 'reduced-motion',
    'with the primary create action': 'with-create-action',
    'without a create action': 'without-create-action',
    'not retryable': 'not-retryable',
  };

  function matrixStates(component: string, matrixName: string): string[] {
    const rows = specContent
      .split('\n')
      .map((line) => line.split('|').map((cell) => cell.trim()))
      .filter((cells) => cells.length >= 4 && cells[1] === matrixName);

    return rows.flatMap((cells) => {
      const label = cells[2].toLowerCase();
      if (component === 'Badge' && label.startsWith('one state per status name')) {
        const statuses = label.match(/\b(?:draft|confirmed|issued|partially_received|partially_shipped|partially_paid|received|shipped|paid|cancelled|void|active|consumed|released)\b/gi) ?? [];
        return statuses.map((status) => status.toUpperCase());
      }
      return [aliases[label] ?? label.replace(/\s+/g, '-')];
    });
  }

  it('matches all components and states in spec.md state matrix', () => {
    for (const comp of COMPONENTS) {
      // In spec.md, DataTable is written as "Data table" and DropdownMenu is written as "Dropdown menu"
      let searchPattern: string = comp;
      if (comp === 'DataTable') searchPattern = 'Data table';
      if (comp === 'DropdownMenu') searchPattern = 'Dropdown menu';
      if (comp === 'EmptyState') searchPattern = 'Empty state';
      if (comp === 'ErrorState') searchPattern = 'Error state';

      expect(
        specContent.includes(`| ${searchPattern} |`),
        `Component ${comp} (${searchPattern}) from STATE_MANIFEST must exist in spec.md state matrix`,
      ).toBe(true);

      const manifestStates = Object.keys(STATE_MANIFEST[comp]).sort();
      expect(matrixStates(comp, searchPattern).sort(), `States for ${comp} must match the matrix`).toEqual(manifestStates);
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
