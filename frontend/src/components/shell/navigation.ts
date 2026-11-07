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
 * (FR-064). Availability is flipped module by module as features are built;
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
        state: 'available',
        group: 'General',
        label: 'Sales Orders',
        path: '/sales',
        reason: null,
        permission: 'sales.read',
        icon: 'sales',
      },
      {
        state: 'available',
        group: 'General',
        label: 'Inventory',
        path: '/inventory',
        reason: null,
        permission: 'inventory.read',
        icon: 'inventory',
      },
      {
        state: 'available',
        group: 'General',
        label: 'Reports',
        path: '/reports',
        reason: null,
        permission: 'reports.read',
        icon: 'reports',
      },
    ],
  },
  {
    name: 'Management',
    entries: [
      {
        state: 'available',
        group: 'Management',
        label: 'Products',
        path: '/products',
        reason: null,
        permission: 'products.read',
        icon: 'products',
      },
      {
        state: 'available',
        group: 'Management',
        label: 'Customers & Suppliers',
        path: '/contacts',
        reason: null,
        permission: 'contacts.read',
        icon: 'contacts',
      },
      {
        state: 'available',
        group: 'Management',
        label: 'Purchasing',
        path: '/purchasing',
        reason: null,
        permission: 'purchasing.read',
        icon: 'purchasing',
      },
      {
        state: 'available',
        group: 'Management',
        label: 'Invoicing',
        path: '/invoicing',
        reason: null,
        permission: 'invoices.read',
        icon: 'invoicing',
      },
      {
        state: 'available',
        group: 'Management',
        label: 'Users & Roles',
        path: '/users',
        reason: null,
        permission: 'users.manage',
        icon: 'users',
      },
    ],
  },
  {
    name: 'Settings',
    entries: [
      {
        state: 'available',
        group: 'Settings',
        label: 'Organization',
        path: '/settings/organization',
        reason: null,
        permission: 'settings.manage',
        icon: 'organization',
      },
      {
        state: 'available',
        group: 'Settings',
        label: 'Audit Log',
        path: '/audit-log',
        reason: null,
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
