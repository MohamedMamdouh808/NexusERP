/**
 * Audit action codes (FR-015).
 *
 * Every audited action emits exactly one code, committed in the same transaction as the
 * business change. Codes are the machine-readable vocabulary of the audit log — clients
 * and filters branch on the code, never on free-form text.
 */
export const AUDIT_ACTIONS = {
  // Authentication
  authLogin: 'auth.login',
  authLoginFailed: 'auth.login_failed',
  authLockout: 'auth.lockout',
  authPasswordChanged: 'auth.password_changed',
  authPasswordChangeFailed: 'auth.password_change_failed',
  authRegister: 'auth.register',

  // Roles and permissions
  rolesCatalogueProvisioned: 'roles.catalogue_provisioned',
  rolesCreated: 'roles.created',
  rolesUpdated: 'roles.updated',
  rolesDeleted: 'roles.deleted',

  // Members
  membersCreated: 'members.created',
  membersRolesChanged: 'members.roles_changed',
  membersDeactivated: 'members.deactivated',
  membersReactivated: 'members.reactivated',
  membersNameChanged: 'members.name_changed',

  // Contacts
  contactsCreated: 'contacts.created',
  contactsUpdated: 'contacts.updated',
  contactsArchived: 'contacts.archived',
  contactsRestored: 'contacts.restored',

  // Products
  productsCreated: 'products.created',
  productsUpdated: 'products.updated',
  productsArchived: 'products.archived',
  productsRestored: 'products.restored',
  productCategoriesCreated: 'product_categories.created',
  unitsOfMeasureCreated: 'units_of_measure.created',

  // Inventory
  warehousesCreated: 'warehouses.created',
  warehousesUpdated: 'warehouses.updated',
  warehousesDeactivated: 'warehouses.deactivated',
  warehousesReactivated: 'warehouses.reactivated',
  stockAdjusted: 'stock.adjusted',

  // Purchasing
  purchaseOrdersCreated: 'purchase_orders.created',
  purchaseOrdersUpdated: 'purchase_orders.updated',
  purchaseOrdersConfirmed: 'purchase_orders.confirmed',
  purchaseOrdersCancelled: 'purchase_orders.cancelled',
  goodsReceiptsPosted: 'goods_receipts.posted',

  // Sales
  salesOrdersCreated: 'sales_orders.created',
  salesOrdersUpdated: 'sales_orders.updated',
  salesOrdersConfirmed: 'sales_orders.confirmed',
  salesOrdersCancelled: 'sales_orders.cancelled',
  shipmentsPosted: 'shipments.posted',

  // Invoicing and payments
  invoicesCreated: 'invoices.created',
  invoicesUpdated: 'invoices.updated',
  invoicesIssued: 'invoices.issued',
  invoicesVoided: 'invoices.voided',
  paymentsRecorded: 'payments.recorded',
  paymentsReversed: 'payments.reversed',

  // Organizations (organization settings feature, P0-F002)
  organizationsUpdated: 'organizations.updated',
  organizationsModuleToggled: 'organizations.module_toggled',
} as const;

/** The type of a single audit action code value. */
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
