/**
 * The one typed navigation list (T024, FR-064).
 *
 * The sidebar renders this and nothing else, and the sidebar's tests assert
 * against it. The design system's own table in `design-system/nexuserp/MASTER.md`
 * mirrors it row for row, and `navigation-master-file.spec.ts` compares the two so
 * the design system cannot describe a sidebar the product does not have
 * (FR-065, SC-015).
 *
 * Two rules are held by the types rather than by a comment:
 *
 *  - An entry is either `available` - it has a destination, and that destination
 *    is a route the application serves - or `Soon`, and then it has no path and
 *    it must state its reason. "Available and unreachable" is therefore not a
 *    value that can be written here (FR-007).
 *  - `permission` is recorded intent and nothing more. Nothing is filtered or
 *    guarded on the client: the server enforces authority (FR-015, FR-067 rule 4,
 *    Constitution Principle II).
 */

import type { IconName } from '../ui/icon';

export type NavGroupName = 'General' | 'Management' | 'Settings';

export type NavEntryState = 'available' | 'Soon';

interface NavEntryFields {
  /** Verbatim from the navigation table - the comparison is exact (FR-064). */
  readonly label: string;
  readonly group: NavGroupName;
  /** The permission this destination will require once authentication exists. */
  readonly permission: string | null;
  /**
   * The glyph the entry shows. At tablet widths the sidebar is icon-only, so
   * every entry needs one, and the accessible name has to survive the change
   * (FR-011).
   */
  readonly icon: IconName;
}

/** An entry whose destination exists. */
export interface AvailableNavEntry extends NavEntryFields {
  readonly state: 'available';
  readonly path: string;
  readonly reason: null;
}

/** An entry for a module this release does not build. */
export interface UnavailableNavEntry extends NavEntryFields {
  readonly state: 'Soon';
  readonly path: null;
  /** Required, and rendered as the tooltip that explains the entry (FR-007). */
  readonly reason: string;
}

export type NavEntry = AvailableNavEntry | UnavailableNavEntry;

export interface NavGroup {
  readonly name: NavGroupName;
  readonly entries: readonly NavEntry[];
}

/**
 * Order is authoritative, both of the groups and of the entries inside them
 * (FR-064). Exactly two entries are available - Overview and System Health - and
 * every group holds at least one entry (FR-067, SC-016).
 *
 * Surface the design system lists but no v1 feature owns - Billing &
 * Subscription, Integrations, Upgrade Plan, Help & Support, global search and
 * notifications - are absent here entirely rather than shown as unavailable
 * (FR-008, FR-016, FR-067).
 */
export const NAVIGATION: readonly NavGroup[] = [
  {
    name: 'General',
    entries: [
      {
        state: 'available',
        group: 'General',
        label: 'Overview',
        path: '/',
        reason: null,
        permission: null,
        icon: 'overview',
      },
      {
        state: 'Soon',
        group: 'General',
        label: 'Sales Orders',
        path: null,
        reason: 'Sales orders are not built yet.',
        permission: 'sales.read',
        icon: 'sales',
      },
      {
        state: 'Soon',
        group: 'General',
        label: 'Inventory',
        path: null,
        reason: 'Inventory is not built yet.',
        permission: 'inventory.read',
        icon: 'inventory',
      },
      {
        state: 'Soon',
        group: 'General',
        label: 'Reports',
        path: null,
        reason: 'Operational reports are not built yet.',
        permission: 'reports.read',
        icon: 'reports',
      },
    ],
  },
  {
    name: 'Management',
    entries: [
      {
        state: 'Soon',
        group: 'Management',
        label: 'Products',
        path: null,
        reason: 'The product catalogue is not built yet.',
        permission: 'products.read',
        icon: 'products',
      },
      {
        state: 'Soon',
        group: 'Management',
        label: 'Customers & Suppliers',
        path: null,
        reason: 'Contacts are not built yet.',
        permission: 'contacts.read',
        icon: 'contacts',
      },
      {
        state: 'Soon',
        group: 'Management',
        label: 'Purchasing',
        path: null,
        reason: 'Purchasing is not built yet.',
        permission: 'purchasing.read',
        icon: 'purchasing',
      },
      {
        state: 'Soon',
        group: 'Management',
        label: 'Invoicing',
        path: null,
        reason: 'Invoicing is not built yet.',
        permission: 'invoices.read',
        icon: 'invoicing',
      },
      {
        state: 'Soon',
        group: 'Management',
        label: 'Users & Roles',
        path: null,
        reason: 'Users and roles are not built yet.',
        permission: 'users.manage',
        icon: 'users',
      },
    ],
  },
  {
    name: 'Settings',
    entries: [
      {
        state: 'Soon',
        group: 'Settings',
        label: 'Organization',
        path: null,
        reason: 'Organization settings are not built yet.',
        permission: 'settings.manage',
        icon: 'organization',
      },
      {
        state: 'Soon',
        group: 'Settings',
        label: 'Audit Log',
        path: null,
        reason: 'The audit log is not built yet.',
        permission: 'audit.read',
        icon: 'audit',
      },
      {
        state: 'available',
        group: 'Settings',
        label: 'System Health',
        path: '/health',
        reason: null,
        permission: null,
        icon: 'health',
      },
    ],
  },
];
