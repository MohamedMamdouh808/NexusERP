import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NAVIGATION } from '../navigation';

/**
 * T018, FR-065, SC-015.
 *
 * The design system's master file publishes the sidebar as a plain table, and the
 * application publishes the same list as `NAVIGATION`. Two descriptions of one
 * thing drift: someone flips a module to available in the code and forgets the
 * table, or edits the table and ships a sidebar the design system does not
 * describe. This suite compares them row for row - group, label, order and state -
 * so a change to one side only fails here rather than in review.
 *
 * It is deliberately shown failing once, with one entry flipped in the master file
 * alone, and the observation is recorded in `evidence/deliberate-failures.md`.
 */

/** The master file lives in the repository, five levels above this test's folder. */
const MASTER_FILE = resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'design-system',
  'nexuserp',
  'MASTER.md',
);

const HEADER = /^\|\s*Group\s*\|\s*Entry\s*\|\s*State\s*\|$/;

interface TableRow {
  readonly group: string;
  readonly label: string;
  readonly state: string;
}

/** Reads the master file's navigation table, in the order it is written. */
function masterNavigationTable(): TableRow[] {
  const lines = readFileSync(MASTER_FILE, 'utf8').split(/\r?\n/);
  const headers = lines
    .map((line, index) => (HEADER.test(line.trim()) ? index : -1))
    .filter((index) => index >= 0);

  expect(
    headers,
    'the master file must carry exactly one navigation table (group, entry, state)',
  ).toHaveLength(1);

  const rows: TableRow[] = [];
  for (let index = headers[0] + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith('|')) break;

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;

    expect(cells, `row ${index + 1} of the master file must have three cells`).toHaveLength(3);
    rows.push({ group: cells[0], label: cells[1], state: cells[2] });
  }

  expect(rows, 'the navigation table must not be empty').not.toHaveLength(0);
  return rows;
}

/** The navigation list, flattened into the table's shape, in its own order. */
function navigationAsRows(): TableRow[] {
  return NAVIGATION.flatMap((group) =>
    group.entries.map((entry) => ({
      group: entry.group,
      label: entry.label,
      state: entry.state,
    })),
  );
}

describe('The navigation list and the master file agree (T018)', () => {
  it('carries the same rows, in the same order, with the same states', () => {
    expect(navigationAsRows()).toEqual(masterNavigationTable());
  });

  it('groups them under the same three groups, in the same order', () => {
    const groups = [...new Set(masterNavigationTable().map((row) => row.group))];

    expect(groups).toEqual(NAVIGATION.map((group) => group.name));
    expect(groups).toEqual(['General', 'Management', 'Settings']);
  });

  it('uses only the two state words the design system defines', () => {
    const states = [...new Set(masterNavigationTable().map((row) => row.state))].sort();

    expect(states).toEqual(['Soon', 'available']);
  });

  it('keeps two entries available and every group populated', () => {
    const rows = masterNavigationTable();
    const available = rows.filter((row) => row.state === 'available').map((row) => row.label);

    expect(available).toEqual(['Overview', 'System Health']);
    for (const group of NAVIGATION) {
      expect(group.entries.length, `${group.name} must hold at least one entry`).toBeGreaterThan(0);
    }
  });
});
