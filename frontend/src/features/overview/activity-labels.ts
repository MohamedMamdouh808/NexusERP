/**
 * The dashboard's activity feed labels - the central map from audit action
 * code to readable sentence.
 *
 * The audit log's `action` field carries machine codes (the shared package's
 * `AUDIT_ACTIONS` vocabulary); the activity card must not echo codes to a
 * person reading it. `ACTIVITY_LABELS` maps every code the backend can
 * write TODAY to a locale key whose values both locales define (the parity is
 * asserted by `dashboard-activity.spec.tsx`). A future code added to the
 * backend vocabulary is inert until its label is added here; that is the
 * process that keeps the map the complete answer.
 *
 * Record types (the audit entries' `recordType` field) map to their routes
 * through `ACTIVITY_RECORD_LINKS`, and to the tinted icons they display
 * through `ACTIVITY_ICONS`.
 */

import type { IconName } from '../../components/ui/icon';

export const ACTIVITY_LABELS: Readonly<Record<string, string>> = {
  'auth.login': 'dashboard.activity.labels.authLogin',
  'auth.login_failed': 'dashboard.activity.labels.authLoginFailed',
  'auth.lockout': 'dashboard.activity.labels.authLockout',
  'auth.password_changed': 'dashboard.activity.labels.authPasswordChanged',
  'auth.password_change_failed': 'dashboard.activity.labels.authPasswordChangeFailed',
  'auth.register': 'dashboard.activity.labels.authRegister',
  'roles.catalogue_provisioned': 'dashboard.activity.labels.rolesCatalogueProvisioned',
  'roles.created': 'dashboard.activity.labels.rolesCreated',
  'roles.updated': 'dashboard.activity.labels.rolesUpdated',
  'roles.deleted': 'dashboard.activity.labels.rolesDeleted',
  'members.created': 'dashboard.activity.labels.membersCreated',
  'members.roles_changed': 'dashboard.activity.labels.membersRolesChanged',
  'members.deactivated': 'dashboard.activity.labels.membersDeactivated',
  'members.reactivated': 'dashboard.activity.labels.membersReactivated',
  'members.name_changed': 'dashboard.activity.labels.membersNameChanged',
  'contacts.created': 'dashboard.activity.labels.contactsCreated',
  'contacts.updated': 'dashboard.activity.labels.contactsUpdated',
  'contacts.archived': 'dashboard.activity.labels.contactsArchived',
  'contacts.restored': 'dashboard.activity.labels.contactsRestored',
  'products.created': 'dashboard.activity.labels.productsCreated',
  'products.updated': 'dashboard.activity.labels.productsUpdated',
  'products.archived': 'dashboard.activity.labels.productsArchived',
  'products.restored': 'dashboard.activity.labels.productsRestored',
  'product_categories.created': 'dashboard.activity.labels.productCategoriesCreated',
  'units_of_measure.created': 'dashboard.activity.labels.unitsOfMeasureCreated',
  'warehouses.created': 'dashboard.activity.labels.warehousesCreated',
  'warehouses.updated': 'dashboard.activity.labels.warehousesUpdated',
  'warehouses.deactivated': 'dashboard.activity.labels.warehousesDeactivated',
  'warehouses.reactivated': 'dashboard.activity.labels.warehousesReactivated',
  'stock.adjusted': 'dashboard.activity.labels.stockAdjusted',
  'purchase_orders.created': 'dashboard.activity.labels.purchaseOrdersCreated',
  'purchase_orders.updated': 'dashboard.activity.labels.purchaseOrdersUpdated',
  'purchase_orders.confirmed': 'dashboard.activity.labels.purchaseOrdersConfirmed',
  'purchase_orders.cancelled': 'dashboard.activity.labels.purchaseOrdersCancelled',
  'goods_receipts.posted': 'dashboard.activity.labels.goodsReceiptsPosted',
  'sales_orders.created': 'dashboard.activity.labels.salesOrdersCreated',
  'sales_orders.updated': 'dashboard.activity.labels.salesOrdersUpdated',
  'sales_orders.confirmed': 'dashboard.activity.labels.salesOrdersConfirmed',
  'sales_orders.cancelled': 'dashboard.activity.labels.salesOrdersCancelled',
  'shipments.posted': 'dashboard.activity.labels.shipmentsPosted',
  'invoices.created': 'dashboard.activity.labels.invoicesCreated',
  'invoices.updated': 'dashboard.activity.labels.invoicesUpdated',
  'invoices.issued': 'dashboard.activity.labels.invoicesIssued',
  'invoices.voided': 'dashboard.activity.labels.invoicesVoided',
  'payments.recorded': 'dashboard.activity.labels.paymentsRecorded',
  'payments.reversed': 'dashboard.activity.labels.paymentsReversed',
  'organizations.updated': 'dashboard.activity.labels.organizationsUpdated',
  'organizations.module_toggled': 'dashboard.activity.labels.organizationsModuleToggled',
};

/** The complete backend vocabulary, as of today: every code in `AUDIT_ACTIONS`. */
export const BACKEND_AUDIT_ACTION_CODES: readonly string[] = [
  'auth.login',
  'auth.login_failed',
  'auth.lockout',
  'auth.password_changed',
  'auth.password_change_failed',
  'auth.register',
  'roles.catalogue_provisioned',
  'roles.created',
  'roles.updated',
  'roles.deleted',
  'members.created',
  'members.roles_changed',
  'members.deactivated',
  'members.reactivated',
  'members.name_changed',
  'contacts.created',
  'contacts.updated',
  'contacts.archived',
  'contacts.restored',
  'products.created',
  'products.updated',
  'products.archived',
  'products.restored',
  'product_categories.created',
  'units_of_measure.created',
  'warehouses.created',
  'warehouses.updated',
  'warehouses.deactivated',
  'warehouses.reactivated',
  'stock.adjusted',
  'purchase_orders.created',
  'purchase_orders.updated',
  'purchase_orders.confirmed',
  'purchase_orders.cancelled',
  'goods_receipts.posted',
  'sales_orders.created',
  'sales_orders.updated',
  'sales_orders.confirmed',
  'sales_orders.cancelled',
  'shipments.posted',
  'invoices.created',
  'invoices.updated',
  'invoices.issued',
  'invoices.voided',
  'payments.recorded',
  'payments.reversed',
  'organizations.updated',
  'organizations.module_toggled',
];

/**
 * Where each audit record type opens; the record id becomes the final path
 * segment. The audit response carries `recordId`, not a printable number, so
 * the link targets by id. Types with no detail screen return the list they
 * belong to.
 */
export const ACTIVITY_RECORD_LINKS: Readonly<Record<string, (recordId: string) => string>> = {
  invoice: (id) => `/invoicing/${id}`,
  payment: (id) => `/invoicing/payments/${id}`,
  sales_order: (id) => `/sales/${id}`,
  purchase_order: (id) => `/purchasing/${id}`,
  product: (id) => `/products/${id}`,
  contact: (id) => `/contacts/${id}`,
  goods_receipt: () => '/purchasing',
  shipment: () => '/sales',
  stock_movement: () => '/inventory',
  warehouse: () => '/inventory',
  role: () => '/users/roles',
};

/**
 * The tinted icon shown for each audit record type. Shared with the
 * attention items and every place an audit record is listed.
 */
export const ACTIVITY_ICONS: Readonly<Record<string, IconName>> = {
  auth: 'health',
  contact: 'contacts',
  goods_receipt: 'inventory',
  invoice: 'invoicing',
  membership: 'users',
  organization: 'organization',
  payment: 'invoicing',
  product: 'products',
  product_category: 'products',
  purchase_order: 'purchasing',
  role: 'users',
  sales_order: 'sales',
  shipment: 'sales',
  stock_movement: 'inventory',
  unit_of_measure: 'products',
  user: 'users',
  warehouse: 'inventory',
};
