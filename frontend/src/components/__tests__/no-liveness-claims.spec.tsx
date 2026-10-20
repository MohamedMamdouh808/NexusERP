import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('No liveness claims in interface (T062, FR-040)', () => {
  const srcDir = resolve(__dirname, '../..');

  const FORBIDDEN_LIVENESS_PHRASES = [
    /\bupdated just now\b/i,
    /\breal-time updates\b/i,
    /\blive sync active\b/i,
    /\bstreaming data\b/i,
  ];

  function collectComponentFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== '__tests__' && entry !== 'node_modules') {
          results.push(...collectComponentFiles(full));
        }
      } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.spec.tsx') && !entry.endsWith('.spec.ts')) {
        results.push(full);
      }
    }
    return results;
  }

  it('contains zero liveness claims, fake real-time indicators, or "updated just now" phrasing', () => {
    const files = collectComponentFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const phrase of FORBIDDEN_LIVENESS_PHRASES) {
        expect(
          phrase.test(content),
          `File ${file} contains deceptive liveness wording matching ${phrase}`,
        ).toBe(false);
      }
    }
  });
});
