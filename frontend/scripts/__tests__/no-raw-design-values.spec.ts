import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { findViolations, isExempt, stripComments } from '../check-no-raw-design-values';

const webRoot = resolve(import.meta.dirname, '..', '..');
const script = join(webRoot, 'scripts', 'check-no-raw-design-values.ts');

const fixtures: string[] = [];

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'design-values-'));
  fixtures.push(dir);
  for (const [name, source] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(resolve(full, '..'), { recursive: true });
    writeFileSync(full, source, 'utf8');
  }
  return dir;
}

function runChecker(target: string): { status: number | null; output: string } {
  const result = spawnSync('npx', ['tsx', script, target], {
    cwd: webRoot,
    encoding: 'utf8',
    // Windows cannot execute the npx shim without a shell; the checker is a
    // pure script and builds no Nest DI container, so tsx is permitted here.
    shell: process.platform === 'win32',
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

afterAll(() => {
  for (const dir of fixtures) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('no-raw-design-values matcher (T082)', () => {
  it('flags a hex colour pasted into a component', () => {
    const violations = findViolations([
      {
        file: 'src/features/health/health-panel.tsx',
        source: 'export const x = <span style={{ color: "#ff0000" }} />;',
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe('hex colour literal');
    expect(violations[0]?.line).toBe(1);
  });

  it('flags a shorthand hex, a colour function and a Tailwind arbitrary value', () => {
    const violations = findViolations([
      { file: 'src/a.tsx', source: 'const a = "color: #fff";' },
      { file: 'src/b.tsx', source: 'const b = "rgba(0, 0, 0, 0.5)";' },
      { file: 'src/c.tsx', source: 'const c = "bg-[#1e40af]";' },
    ]);

    expect(violations.map((violation) => violation.rule)).toEqual([
      'hex colour literal',
      'colour function',
      'Tailwind arbitrary colour value',
    ]);
  });

  it('accepts a component that reads tokens', () => {
    const violations = findViolations([
      {
        file: 'src/features/health/health-panel.tsx',
        source: 'export const x = <span className="health-panel__request-id mono" />;',
      },
      { file: 'src/styles/app.css', source: '.card { background: var(--color-card); }' },
    ]);

    expect(violations).toEqual([]);
  });

  it('exempts the token file, which is the one place a value is allowed to be written', () => {
    expect(isExempt('src/styles/tokens.css')).toBe(true);
    expect(isExempt('src\\styles\\tokens.css')).toBe(true);
    expect(isExempt('src/styles/app.css')).toBe(false);
    expect(
      findViolations([{ file: 'src/styles/tokens.css', source: ':root { --color-primary: #1e40af; }' }]),
    ).toEqual([]);
  });

  it('does not trip on a comment that names a colour, or on an anchor fragment', () => {
    const source = [
      '/**',
      ' * The palette uses #1e40af as the primary colour.',
      ' */',
      '// eslint-disable-next-line -- #ffffff is discussed above',
      'export const skip = <a href="#main-content" />;',
    ].join('\n');

    expect(findViolations([{ file: 'src/a.tsx', source }])).toEqual([]);
    expect(stripComments(source)).not.toContain('#1e40af');
  });
});

describe('no-raw-design-values command (T082)', () => {
  it('exits non-zero and names the file and line when a component carries a raw colour', () => {
    const dir = fixtureDir({
      'good.tsx': 'export const a = <span className="card" />;\n',
      'bad.tsx': 'export const style = { borderColor: "#64748b" };\n',
    });

    const { status, output } = runChecker(dir);

    expect(status).toBe(1);
    expect(output).toContain('bad.tsx:1');
    expect(output).toContain('hex colour literal');
  }, 60_000);

  it('exits zero on a tree whose colours all come from tokens', () => {
    const dir = fixtureDir({
      'good.tsx': 'export const a = <span className="card" />;\n',
      'good.css': '.card { background: var(--color-card); color: var(--color-card-foreground); }\n',
      'styles/tokens.css': ':root { --color-card: #ffffff; }\n',
    });

    const { status, output } = runChecker(dir);

    expect(status).toBe(0);
    expect(output).toContain('no raw design values');
  }, 60_000);

  it('passes against the interface as it actually ships', () => {
    const { status, output } = runChecker('src');

    expect(output).toContain('no raw design values');
    expect(status).toBe(0);
  }, 60_000);
});