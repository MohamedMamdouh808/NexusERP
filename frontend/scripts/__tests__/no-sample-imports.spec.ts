/**
 * T055 - Tests for the no-sample-imports guard (FR-045, FR-047).
 * The guard must pass on the clean tree and fail on an injected production import.
 */

import { describe, expect, it } from 'vitest';
import { findViolations, isExempt, stripComments } from '../check-no-sample-imports';

describe('no-sample-imports guard (T055, FR-045, FR-047)', () => {
  it('passes on clean production source', () => {
    const files = [
      { path: 'features/x/page.tsx', contents: "import { thing } from '../../services/real-client';\nexport const x = thing;" },
      { path: 'services/catalog-service.ts', contents: 'export interface Catalog {}' },
    ];
    expect(findViolations(files)).toEqual([]);
  });

  it('fails on a production import of the sample service', () => {
    const files = [
      {
        path: 'features/x/page.tsx',
        contents: "import { sampleCatalogService } from '../../services/sample-catalog-service';",
      },
    ];
    const violations = findViolations(files);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.rule === 'sample service import')).toBe(true);
  });

  it('fails on a mock folder import and on the sample banner identifier', () => {
    const files = [
      { path: 'features/y/page.ts', contents: "import { data } from '../../mocks/data';" },
      { path: 'features/z/page.tsx', contents: 'return <SampleDataBanner />;' },
    ];
    const rules = findViolations(files).map((v) => v.rule);
    expect(rules).toContain('mock folder import');
    expect(rules).toContain('sample banner identifier');
  });

  it('exempts gallery fixtures, test files and test directories', () => {
    expect(isExempt('dev/gallery/gallery-route.tsx')).toBe(true);
    expect(isExempt('features/x/__tests__/x.spec.ts')).toBe(true);
    expect(isExempt('services/__tests__/catalog-service.spec.ts')).toBe(true);
    expect(isExempt('features/x/page.tsx')).toBe(false);
  });

  it('ignores commented-out mentions', () => {
    const src = '// import { sampleCatalogService } from "../services/sample-catalog-service";\nexport const ok = 1;';
    expect(findViolations([{ path: 'a.ts', contents: src }])).toEqual([]);
    expect(stripComments('/* sampleCatalogService */ ok')).not.toContain('sampleCatalogService');
  });
});
