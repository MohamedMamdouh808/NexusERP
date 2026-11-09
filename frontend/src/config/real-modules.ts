/**
 * One file that says which modules talk to the real service (FR-036).
 *
 * Today only the health panel has a backend; every other surface reads its
 * sample data through `src/services/sample-catalog-service.ts`. When a module's
 * backend arrives, this list is where the switch happens: flip `real` for its
 * key, wire its pages to the real client, delete its sample rows from
 * `src/mocks/sample-data.ts`, and the shared `SampleDataBanner` disappears from
 * that module on its own - nothing in the feature pages needs to change.
 *
 * Keys are the sidebar's module keys (navigation.ts), plus the two
 * destinations that live outside the sidebar's module list. A key that is not
 * listed reads as sample (`isSampleModule` is deliberately boring).
 */

export interface ModuleBackendEntry {
  readonly key: string;
  readonly label: string;
  /** True once the module's pages read the real service end to end. */
  readonly real: boolean;
}

export const MODULE_BACKENDS: readonly ModuleBackendEntry[] = [
  { key: 'overview', label: 'Dashboard', real: false },
  { key: 'products', label: 'Products', real: false },
  { key: 'contacts', label: 'Contacts', real: false },
  { key: 'inventory', label: 'Inventory', real: false },
  { key: 'purchasing', label: 'Purchasing', real: false },
  { key: 'sales', label: 'Sales', real: false },
  { key: 'invoicing', label: 'Invoicing', real: false },
  { key: 'payments', label: 'Payments', real: false },
  { key: 'settings', label: 'Organization settings', real: false },
  { key: 'audit', label: 'Audit log', real: false },
  { key: 'reports', label: 'Reports', real: false },
  { key: 'administration', label: 'Users & Roles', real: false },
  // Profile reads the real session (identity comes from /auth/me).
  { key: 'profile', label: 'Profile', real: true },
  { key: 'health', label: 'System health', real: true },
] as const;

const REAL_KEYS = new Set(
  MODULE_BACKENDS.filter((entry) => entry.real).map((entry) => entry.key),
);

/** True when the module still shows sample data (the default). */
export function isSampleModule(moduleKey: string): boolean {
  return !REAL_KEYS.has(moduleKey);
}
