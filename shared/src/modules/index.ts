/**
 * Organization module keys and dependency rules.
 *
 * Module availability is a workspace-wide setting owned by the Organizations
 * module; per-member visibility remains driven by permissions. This package
 * carries only the vocabulary (keys and fixed dependency rules) so both the
 * service and the interface agree on what modules exist and which ones depend
 * on which — no database access, no framework imports.
 */
export type ModuleKey =
  | 'inventory'
  | 'purchasing'
  | 'sales'
  | 'invoicing'
  | 'reports'
  | 'contacts'
  | 'products'
  | 'settings'
  | 'audit';

export const MODULE_KEYS: readonly ModuleKey[] = [
  'inventory',
  'purchasing',
  'sales',
  'invoicing',
  'reports',
  'contacts',
  'products',
  'settings',
  'audit',
];

/** Modules an administrator may switch on or off. */
export const SWITCHABLE_MODULE_KEYS: readonly ModuleKey[] = [
  'inventory',
  'purchasing',
  'sales',
  'invoicing',
  'reports',
];

/** Modules that are permanently on and never switchable. */
export const ALWAYS_ON_MODULE_KEYS: readonly ModuleKey[] = [
  'contacts',
  'products',
  'settings',
  'audit',
];

/**
 * Dependencies owned by the Organizations module.
 *
 * sales requires inventory, purchasing requires inventory, invoicing requires
 * sales. A module may not be switched off while an enabled module depends on
 * it, and may not be switched on until its own requirement is on.
 */
export const MODULE_DEPENDENCIES: ReadonlyMap<ModuleKey, ModuleKey> = new Map([
  ['sales', 'inventory'],
  ['purchasing', 'inventory'],
  ['invoicing', 'sales'],
]);

/**
 * Reverse of MODULE_DEPENDENCIES: which enabled modules depend on a given one.
 * sales→inventory and purchasing→inventory means inventory's dependents are
 * sales and purchasing.
 */
export const MODULE_DEPENDENTS: ReadonlyMap<ModuleKey, readonly ModuleKey[]> = new Map([
  ['inventory', ['sales', 'purchasing'] as const],
  ['sales', ['invoicing'] as const],
]);

export function isSwitchableModule(key: string): key is ModuleKey {
  return SWITCHABLE_MODULE_KEYS.includes(key as ModuleKey);
}

export function isAlwaysOnModule(key: string): key is ModuleKey {
  return ALWAYS_ON_MODULE_KEYS.includes(key as ModuleKey);
}

/** One module's availability as read from the session/guard cache. */
export interface ModuleState {
  readonly key: ModuleKey;
  readonly enabled: boolean;
  readonly version: number;
}
