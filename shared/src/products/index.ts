/**
 * The products contract: the vocabulary the service and the interface both read.
 *
 * Like the rest of this package, it carries no domain logic and no database
 * access. It names the values that may travel between the two sides and the
 * defaults that apply when a caller says nothing, so that a filter the service
 * would reject is a filter the interface never offers.
 */

/** The archival states a product may be listed under. `all` is a filter, not a state. */
export const PRODUCT_STATUS_FILTERS = ['all', 'active', 'archived'] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number];

/** The role a contact-like product filter may use. */
export const PRODUCT_ROLE_FILTERS = ['all', 'customer', 'supplier'] as const;
export type ProductRoleFilter = (typeof PRODUCT_ROLE_FILTERS)[number];

/** The columns a product list may be sorted by. */
export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'createdAt'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export const PRODUCT_SORT_ORDERS = ['asc', 'desc'] as const;
export type ProductSortOrder = (typeof PRODUCT_SORT_ORDERS)[number];

/**
 * The list defaults and limits.
 *
 * The page size has a ceiling: a catalogue of ten thousand products is served a
 * page at a time, never the whole table.
 */
export const PRODUCT_LIST_DEFAULTS = {
  page: 1,
  pageSize: 25,
  maxPageSize: 100,
  status: 'active',
  sortBy: 'name',
  sortOrder: 'asc',
} as const satisfies {
  readonly page: number;
  readonly pageSize: number;
  readonly maxPageSize: number;
  readonly status: ProductStatusFilter;
  readonly sortBy: ProductSortField;
  readonly sortOrder: ProductSortOrder;
};

/** The query a product list accepts. Every field is optional. */
export interface ProductListQuery {
  readonly search?: string;
  readonly categoryId?: string;
  readonly status?: ProductStatusFilter;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: ProductSortField;
  readonly sortOrder?: ProductSortOrder;
}

/** The permissions the products endpoints declare. */
export const PRODUCT_PERMISSIONS = {
  read: 'products.read',
  write: 'products.write',
} as const;

/**
 * The term the interface uses for the low-stock threshold.
 *
 * One term, everywhere: the product screens, the Inventory screens and the
 * Overview screens name the same thing the same way.
 */
export const PRODUCT_REORDER_LEVEL_LABEL = 'Reorder level (low-stock threshold)';

/**
 * The default units of measure every organization receives.
 *
 * A product cannot be created without a unit of measure, so an organization
 * that starts empty could not create its first product. These four cover the
 * everyday trading goods, and because they belong to the organization they can
 * be renamed or added to later.
 */
export const DEFAULT_UNITS_OF_MEASURE: readonly { readonly name: string; readonly abbreviation: string }[] = [
  { name: 'unit', abbreviation: 'unit' },
  { name: 'pair', abbreviation: 'pair' },
  { name: 'roll', abbreviation: 'roll' },
  { name: 'box', abbreviation: 'box' },
];

/** The precision of the prices and of the reorder level, in decimal places. */
export const PRODUCT_PRICE_PRECISION = 4;
export const PRODUCT_REORDER_LEVEL_PRECISION = 3;
