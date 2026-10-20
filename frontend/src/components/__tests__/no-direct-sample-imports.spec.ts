import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('No direct sample imports in components (T060, FR-036)', () => {
  const componentsDir = resolve(__dirname, '..');

  function scanFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== '__tests__') {
          results.push(...scanFiles(full));
        }
      } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.spec.tsx') && !entry.endsWith('.spec.ts')) {
        results.push(full);
      }
    }
    return results;
  }

  it('prohibits any component from importing directly from src/mocks', () => {
    const files = scanFiles(componentsDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      expect(
        content.includes('/mocks/'),
        `Component file ${file} directly imports from /mocks/. It must access data through the service interface.`,
      ).toBe(false);
    }
  });
});
