/**
 * The navigation the shell renders (T086).
 *
 * Only the two entries this feature can actually honour. Every other module from
 * the design system's sidebar grouping - Sales, Inventory, Purchasing, Invoicing,
 * Contacts, Products, Reports, Audit, Settings - belongs to a later feature, and
 * rendering a link to a screen that does not exist would be a control implying a
 * business action that is not there (T078).
 *
 * Each entry carries the permission it will require. Nothing here is filtered by
 * permissions yet, because authentication is not part of this feature and there is
 * no session to read them from; the field records the intent so the filter is
 * added in one place when it arrives (research.md R-015, R-016).
 */

export interface NavItem {
  readonly path: string;
  readonly label: string;
  /** The permission this destination will declare once authentication exists. */
  readonly permission: string | null;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'Overview', permission: null },
  { path: '/health', label: 'System health', permission: null },
];