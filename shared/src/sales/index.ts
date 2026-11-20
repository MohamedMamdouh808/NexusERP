/**
 * The permissions the sales endpoints declare.
 *
 * The codes are the same strings the service guards; this map exists so the
 * screens can name them without restating the strings by hand.
 */
export const SALES_PERMISSIONS = {
  read: 'sales.read',
  write: 'sales.write',
} as const;

/** POST /sales-orders/:id/shipments declares inventory.ship: it is a stock movement as well as a sales event. */
export const INVENTORY_PERMISSIONS = {
  ship: 'inventory.ship',
} as const;
