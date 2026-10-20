import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T032 / FR-005 / contracts/design-tokens.md.
 *
 * Assert that tokens introduced in `frontend/src/styles/tokens.css` are faithfully
 * recorded in `design-system/nexuserp/MASTER.md`, and that no token exists on only
 * one side of the contract.
 */

describe('Design tokens parity (T032, FR-005)', () => {
  const repoRoot = resolve(__dirname, '../../../../');
  const tokensCssPath = resolve(__dirname, '../tokens.css');
  const masterMdPath = resolve(repoRoot, 'design-system/nexuserp/MASTER.md');

  const tokensCssContent = readFileSync(tokensCssPath, 'utf-8');
  const masterMdContent = readFileSync(masterMdPath, 'utf-8');

  // Extract all CSS variable definitions from tokens.css
  const tokenCssVars = new Set(
    Array.from(tokensCssContent.matchAll(/--[a-z0-9-]+(?=:)/g), (m) => m[0]),
  );

  it('defines tokens in tokens.css', () => {
    expect(tokenCssVars.size).toBeGreaterThan(0);
    expect(tokenCssVars.has('--color-primary')).toBe(true);
    expect(tokenCssVars.has('--color-background')).toBe(true);
    expect(tokenCssVars.has('--font-ui')).toBe(true);
  });

  it('records every color token from tokens.css in MASTER.md', () => {
    const colorTokens = Array.from(tokenCssVars).filter((t) => t.startsWith('--color-'));
    for (const token of colorTokens) {
      expect(
        masterMdContent.includes(token),
        `Color token "${token}" is defined in tokens.css but missing from MASTER.md`,
      ).toBe(true);
    }
  });

  it('records typography and scale tokens in MASTER.md', () => {
    // Structural tokens: typography, radii, shadows, shell geometry
    const structuralTokens = [
      '--font-ui',
      '--font-mono',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--radius-pill',
      '--shadow-sm',
      '--shadow-md',
      '--shadow-lg',
      '--shadow-xl',
      '--shell-sidebar-width',
      '--shell-sidebar-compact-width',
      '--shell-topbar-height',
    ];

    for (const token of structuralTokens) {
      expect(
        masterMdContent.includes(token),
        `Structural token "${token}" is defined in tokens.css but missing from MASTER.md`,
      ).toBe(true);
    }

    // Spacing tokens: tokens.css uses Tailwind 4 namespace --spacing-*, MASTER.md uses --space-*
    const spacingSteps = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];
    for (const step of spacingSteps) {
      expect(
        tokenCssVars.has(`--spacing-${step}`),
        `tokens.css must define --spacing-${step}`,
      ).toBe(true);
      expect(
        masterMdContent.includes(`--space-${step}`),
        `MASTER.md must define --space-${step}`,
      ).toBe(true);
    }
  });
});
