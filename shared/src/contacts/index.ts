/**
 * The contacts contract: the vocabulary the service and the interface both read.
 *
 * Like the rest of this package, it carries NO domain logic and no database
 * access: it names the values that may travel between the two sides and the
 * defaults that apply when a caller says nothing. Both sides read these names
 * instead of restating them, which is what stops a filter the service accepts
 * from drifting away from one the interface offers.
 */

/** The roles a contact may be listed under. `all` is a filter, not a role. */
export const CONTACT_ROLE_FILTERS = ['all', 'customer', 'supplier'] as const;
export type ContactRoleFilter = (typeof CONTACT_ROLE_FILTERS)[number];

/** The archival states a contact may be listed under. */
export const CONTACT_STATUS_FILTERS = ['all', 'active', 'archived'] as const;
export type ContactStatusFilter = (typeof CONTACT_STATUS_FILTERS)[number];

/** The columns a contact list may be sorted by. */
export const CONTACT_SORT_FIELDS = ['name', 'code', 'createdAt'] as const;
export type ContactSortField = (typeof CONTACT_SORT_FIELDS)[number];

export const CONTACT_SORT_ORDERS = ['asc', 'desc'] as const;
export type ContactSortOrder = (typeof CONTACT_SORT_ORDERS)[number];

/**
 * The list defaults and limits.
 *
 * The page size has a ceiling: a directory of ten thousand contacts is served
 * a page at a time, never the whole table.
 */
export const CONTACT_LIST_DEFAULTS = {
  page: 1,
  pageSize: 25,
  maxPageSize: 100,
  role: 'all',
  status: 'active',
  sortBy: 'name',
  sortOrder: 'asc',
} as const satisfies {
  readonly page: number;
  readonly pageSize: number;
  readonly maxPageSize: number;
  readonly role: ContactRoleFilter;
  readonly status: ContactStatusFilter;
  readonly sortBy: ContactSortField;
  readonly sortOrder: ContactSortOrder;
};

/** The query a contact list accepts. Every field is optional. */
export interface ContactListQuery {
  readonly search?: string;
  readonly role?: ContactRoleFilter;
  readonly status?: ContactStatusFilter;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: ContactSortField;
  readonly sortOrder?: ContactSortOrder;
}

/** The permissions the contacts endpoints declare. */
export const CONTACT_PERMISSIONS = {
  read: 'contacts.read',
  write: 'contacts.write',
} as const;
