/**
 * The permission catalog and the five default role templates.
 *
 * This module is the single version-controlled source of the product's permission
 * vocabulary. The seed (T027) loads it into the database; the AccessControl feature
 * will materialize organization-owned roles from these templates rather than
 * restating them, so the two cannot disagree (research.md R-016).
 *
 * No user or organization exists yet, so nothing here is tenant data: these are the
 * PRODUCT's definitions, not any organization's grants.
 */

/** A permission code must be `resource.action`, both lowercase. */
export const PERMISSION_CODE_PATTERN = /^[a-z]+\.[a-z]+$/;

/** Domain module a permission belongs to. Matches the NestJS module names. */
export const PERMISSION_MODULES = [
  'contacts',
  'products',
  'inventory',
  'purchasing',
  'sales',
  'invoices',
  'payments',
  'reports',
  'audit',
  'users',
  'roles',
  'settings',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

/** One permission in the catalog. */
export interface PermissionDefinition {
  readonly code: string;
  readonly module: PermissionModule;
  readonly description: string;
}

/**
 * Every permission the product defines today.
 *
 * A permission MUST NOT be added here except in the same commit that introduces the
 * endpoint declaring it. A permission no endpoint checks is a dead code that will
 * eventually be granted to a role and will never be enforced.
 */
export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  // Contacts
  { code: 'contacts.read', module: 'contacts', description: 'View customers and suppliers' },
  { code: 'contacts.write', module: 'contacts', description: 'Create, edit and archive contacts' },

  // Products
  { code: 'products.read', module: 'products', description: 'View products, categories and units' },
  {
    code: 'products.write',
    module: 'products',
    description: 'Create, edit and archive products and their categories',
  },

  // Inventory
  { code: 'inventory.read', module: 'inventory', description: 'View stock balances and movements' },
  { code: 'inventory.write', module: 'inventory', description: 'Manage warehouses' },
  { code: 'inventory.receive', module: 'inventory', description: 'Receive goods against a purchase order' },
  { code: 'inventory.ship', module: 'inventory', description: 'Post a shipment and deduct stock' },
  { code: 'inventory.adjust', module: 'inventory', description: 'Post a stock adjustment with a reason' },

  // Purchasing
  { code: 'purchasing.read', module: 'purchasing', description: 'View purchase orders and receipts' },
  { code: 'purchasing.write', module: 'purchasing', description: 'Create, confirm and cancel purchase orders' },

  // Sales
  { code: 'sales.read', module: 'sales', description: 'View sales orders' },
  { code: 'sales.write', module: 'sales', description: 'Create, confirm and cancel sales orders' },

  // Invoicing
  { code: 'invoices.read', module: 'invoices', description: 'View invoices' },
  { code: 'invoices.write', module: 'invoices', description: 'Create and edit draft invoices' },
  { code: 'invoices.issue', module: 'invoices', description: 'Issue an invoice, making it immutable' },
  { code: 'invoices.void', module: 'invoices', description: 'Void an issued invoice with a reason' },

  // Payments
  { code: 'payments.read', module: 'payments', description: 'View payments and allocations' },
  { code: 'payments.record', module: 'payments', description: 'Record a payment and allocate it' },
  { code: 'payments.reverse', module: 'payments', description: 'Reverse a payment with a reason' },

  // Reporting and audit
  { code: 'reports.read', module: 'reports', description: 'View operational reports' },
  { code: 'audit.read', module: 'audit', description: 'View the audit log' },

  // Administration
  { code: 'users.manage', module: 'users', description: 'Create users and manage memberships' },
  { code: 'roles.manage', module: 'roles', description: 'Create roles and assign permissions' },
  { code: 'settings.manage', module: 'settings', description: 'Change organization settings and modules' },
] as const;

/** Every permission code, as a set for O(1) lookup. */
export const PERMISSION_CODES: ReadonlySet<string> = new Set(
  PERMISSION_CATALOG.map((permission) => permission.code),
);

/** One default role template. */
export interface RoleTemplateDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
}

/** Permissions every role except the least privileged ones already implies. */
const SALES_PERMISSIONS = [
  'contacts.read',
  'contacts.write',
  'products.read',
  'inventory.read',
  'sales.read',
  'sales.write',
  'invoices.read',
] as const;

/**
 * The five default role templates.
 *
 * `administrator` is defined as "every permission in the catalog" rather than as an
 * enumerated list, so a new permission cannot be added to the catalog and silently
 * fail to reach the administrator. The test in
 * `src/__tests__/permissions.spec.ts` asserts the resolution explicitly.
 */
export const ROLE_TEMPLATES: readonly RoleTemplateDefinition[] = [
  {
    key: 'administrator',
    name: 'Administrator',
    description: 'Full access to every module and every administrative action.',
    permissions: PERMISSION_CATALOG.map((permission) => permission.code),
  },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Every operational action, without user, role or settings administration.',
    permissions: PERMISSION_CATALOG.map((permission) => permission.code)
      .filter(
        (code) =>
          code !== 'users.manage' && code !== 'roles.manage' && code !== 'settings.manage',
      ),
  },
  {
    key: 'sales',
    name: 'Sales',
    description: 'Contacts, products, stock visibility, sales orders and invoice visibility.',
    permissions: SALES_PERMISSIONS,
  },
  {
    key: 'inventory',
    name: 'Inventory',
    description: 'Products, stock, goods receipt, shipment and adjustment, with purchasing and sales visibility.',
    permissions: [
      'products.read',
      'inventory.read',
      'inventory.write',
      'inventory.receive',
      'inventory.ship',
      'inventory.adjust',
      'purchasing.read',
      'sales.read',
    ],
  },
  {
    key: 'purchasing',
    name: 'Purchasing',
    description: 'Contacts, products, stock visibility and purchase orders.',
    permissions: [
      'contacts.read',
      'contacts.write',
      'products.read',
      'inventory.read',
      'purchasing.read',
      'purchasing.write',
    ],
  },
] as const;

/** The role template keys, for lookup and validation. */
export const ROLE_TEMPLATE_KEYS: readonly string[] = ROLE_TEMPLATES.map((role) => role.key);