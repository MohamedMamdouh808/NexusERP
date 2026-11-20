/**
 * Runtime module availability derived from the session payload (FR-040..FR-042).
 *
 * This is the ONLY place that maps routes/sections to module keys. The static
 * navigation list (`navigation.ts`) and the design-system master file are never
 * modified: a disabled entry is rendered as unavailable by the sidebar, and a
 * disabled route is redirected by the shell, both using these helpers.
 */

import type { SessionState } from '../../services/auth-session';

const PATH_MODULE: readonly [RegExp, string][] = [
  [/^\/inventory/, 'inventory'],
  [/^\/purchasing/, 'purchasing'],
  [/^\/sales/, 'sales'],
  [/^\/invoicing/, 'invoicing'],
  [/^\/reports/, 'reports'],
];

/** The switchable module a path belongs to, or null for module-neutral paths. */
export function moduleForPath(pathname: string): string | null {
  for (const [pattern, key] of PATH_MODULE) {
    if (pattern.test(pathname)) return key;
  }
  return null;
}

/** Whether a module is enabled for the signed-in session. Fails closed. */
export function isModuleEnabled(session: SessionState, key: string): boolean {
  if (session.status !== 'signed-in') return false;
  if (!SWITCHABLE.has(key)) return true; // always-on modules are never disabled
  return session.organization.enabledModules.includes(key);
}

const SWITCHABLE = new Set([
  'inventory',
  'purchasing',
  'sales',
  'invoicing',
  'reports',
]);

/** A locale-key label for a module (matching administration.org.moduleLabels.*). */
export function moduleLabelKey(key: string): string {
  return `administration.org.moduleLabels.${key}`;
}
