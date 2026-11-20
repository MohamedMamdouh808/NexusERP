#!/usr/bin/env node
/**
 * Deterministic performance dataset generator (Feature 019, FR-028).
 *
 * Seeds the ISOLATED `nexuserp_test` schema with a realistic workspace at the size the
 * baseline and the query-count budgets are measured against:
 *
 *   products >= 2,000   stock movements >= 20,000   invoices >= 5,000
 *   sales orders >= 5,000   purchase orders >= 2,000   payments >= 5,000
 *
 * Safety rules, in order:
 *   1. DATABASE_URL must state `schema=nexuserp_test`; anything else aborts BEFORE a
 *      connection is used.
 *   2. The connected `current_schema()` must be `nexuserp_test` (a URL parameter alone
 *      is not evidence that the connection landed there).
 *   3. The schema must be migrated (`_prisma_migrations` exists).
 *   4. If the performance organization already exists, the run aborts: the append-only
 *      ledgers cannot be deleted, so a rerun requires the reset script below.
 *   5. The connection string is never printed.
 *
 * Reset and rebuild:
 *   node scripts/reset-test-schema.mjs --migrate
 *   node scripts/generate-perf-dataset.mjs
 *
 * Determinism: a fixed PRNG seed and hash-derived UUIDs mean the same rows, with the
 * same ids, every run. No `Math.random()` and no wall-clock timestamps are used for
 * values that affect a measurement (created_at values are fixed offsets from a base
 * date).
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_SCHEMA = 'nexuserp_test';
const SEED = 20_261_120;
const PRNG_SEED = 0x019019;

const COUNTS = Object.freeze({
  products: 2_000,
  stockMovements: 20_000,
  invoices: 5_000,
  salesOrders: 5_000,
  purchaseOrders: 2_000,
  payments: 5_000,
  customers: 300,
  suppliers: 150,
  both: 50,
  warehouses: 3,
  categories: 20,
  units: 5,
  stockProducts: 500,
  stockWarehouses: 2,
});

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PERF_EMAIL = 'perf.owner@nexusperf.test';
const PERF_PASSWORD = 'Performance#019';

const BASE_DATE = new Date('2026-01-05T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function loadEnvFile() {
  const envPath = join(repoRoot, '.env');
  if (!existsSync(envPath)) return {};
  const result = {};
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = withoutExport.indexOf('=');
    if (separator <= 0) continue;
    const key = withoutExport.slice(0, separator).trim();
    let value = withoutExport.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function schemaOf(databaseUrl) {
  const match = /[?&]schema=([^&]*)/.exec(databaseUrl);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Deterministic UUIDv4-shaped identifier for a (kind, index) pair. */
function idFor(kind, index) {
  const digest = createHash('sha256')
    .update(`nexuserp-perf:${SEED}:${kind}:${index}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Deterministic PRNG so every run produces the same distributions. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const random = mulberry32(PRNG_SEED);
const randomInt = (minimum, maximum) =>
  minimum + Math.floor(random() * (maximum - minimum + 1));
const pick = (items) => items[Math.floor(random() * items.length)];

const money = (cents) => (cents / 100).toFixed(2);
const price = (tenThousandths) => (tenThousandths / 10_000).toFixed(4);
const quantity = (thousandths) => (thousandths / 1_000).toFixed(3);
const dateAt = (dayOffset) => new Date(BASE_DATE.getTime() + dayOffset * DAY_MS);

/** line total in cents, half up, from thousandths x ten-thousandths. */
function lineTotalCents(quantityThousandths, unitPriceTenThousandths) {
  return Math.round((quantityThousandths * unitPriceTenThousandths) / 100_000);
}

async function insertAll(delegate, rows, label, chunkSize = 500) {
  if (rows.length === 0) return;
  for (let start = 0; start < rows.length; start += chunkSize) {
    await delegate.createMany({ data: rows.slice(start, start + chunkSize) });
  }
  console.log(`[generate-perf-dataset] inserted ${rows.length} ${label}`);
}

async function main() {
  const environment = { ...loadEnvFile(), ...process.env };
  const databaseUrl = environment.DATABASE_URL;

  if (!databaseUrl) {
    console.error('[generate-perf-dataset] DATABASE_URL is not set.');
    process.exit(2);
  }

  const schema = schemaOf(databaseUrl);
  if (schema !== TEST_SCHEMA) {
    console.error(
      `[generate-perf-dataset] refusing to run: DATABASE_URL must target the isolated schema ` +
        `"${TEST_SCHEMA}" (found "${schema ?? 'no schema parameter'}"). ` +
        'Reset it with: node scripts/reset-test-schema.mjs --migrate',
    );
    process.exit(2);
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    const schemaRow = await prisma.$queryRawUnsafe('SELECT current_schema()::text AS s');
    if (schemaRow[0]?.s !== TEST_SCHEMA) {
      console.error(
        `[generate-perf-dataset] refusing to run: connected to schema "${schemaRow[0]?.s}", ` +
          `expected "${TEST_SCHEMA}".`,
      );
      process.exit(2);
    }

    const migrations = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS c FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = '_prisma_migrations'`,
      TEST_SCHEMA,
    );
    if ((migrations[0]?.c ?? 0) === 0) {
      console.error(
        '[generate-perf-dataset] the isolated schema is not migrated. ' +
          'Run: node scripts/reset-test-schema.mjs --migrate',
      );
      process.exit(2);
    }

    const reuseExisting = process.argv.includes('--reuse');
    const existing = await prisma.organization.findUnique({ where: { id: ORGANIZATION_ID } });
    if (existing) {
      if (!reuseExisting) {
        console.error(
          '[generate-perf-dataset] the performance workspace already exists. The ledgers are ' +
            'append-only, so a rerun requires a clean schema: ' +
            'node scripts/reset-test-schema.mjs --migrate (or pass --reuse to verify and keep it)',
        );
        process.exit(2);
      }

      const [productsCount, movementsCount, invoicesCount, salesOrdersCount, purchaseOrdersCount, paymentsCount] =
        await Promise.all([
          prisma.product.count({ where: { organizationId: ORGANIZATION_ID } }),
          prisma.stockMovement.count({ where: { organizationId: ORGANIZATION_ID } }),
          prisma.invoice.count({ where: { organizationId: ORGANIZATION_ID } }),
          prisma.salesOrder.count({ where: { organizationId: ORGANIZATION_ID } }),
          prisma.purchaseOrder.count({ where: { organizationId: ORGANIZATION_ID } }),
          prisma.payment.count({ where: { organizationId: ORGANIZATION_ID } }),
        ]);
      const shortfalls = [];
      if (productsCount < COUNTS.products) shortfalls.push(`products ${productsCount}/${COUNTS.products}`);
      if (movementsCount < COUNTS.stockMovements) shortfalls.push(`stockMovements ${movementsCount}/${COUNTS.stockMovements}`);
      if (invoicesCount < COUNTS.invoices) shortfalls.push(`invoices ${invoicesCount}/${COUNTS.invoices}`);
      if (salesOrdersCount < COUNTS.salesOrders) shortfalls.push(`salesOrders ${salesOrdersCount}/${COUNTS.salesOrders}`);
      if (purchaseOrdersCount < COUNTS.purchaseOrders) shortfalls.push(`purchaseOrders ${purchaseOrdersCount}/${COUNTS.purchaseOrders}`);
      if (paymentsCount < COUNTS.payments) shortfalls.push(`payments ${paymentsCount}/${COUNTS.payments}`);
      if (shortfalls.length > 0) {
        console.error(
          '[generate-perf-dataset] --reuse failed; dataset is short: ' + shortfalls.join(', ') +
            '. Reset with: node scripts/reset-test-schema.mjs --migrate',
        );
        process.exit(2);
      }
      console.log('[generate-perf-dataset] reusing existing dataset (counts verified)');
      process.exit(0);
    }

    // The permission catalogue is the product vocabulary, not tenant data. Import the
    // version-controlled source rather than restating it, so a granted code cannot go
    // missing from the dataset (shared/dist is built by the root build).
    let PERMISSION_CATALOG;
    try {
      ({ PERMISSION_CATALOG } = await import('@nexuserp/shared'));
    } catch (error) {
      console.error(
        '[generate-perf-dataset] @nexuserp/shared is not built. Run: ' +
          `npm run build --workspace @nexuserp/shared (${error instanceof Error ? error.message : String(error)})`,
      );
      process.exit(2);
    }

    const startedAt = Date.now();

    // ------------------------------------------------------------------
    // Global permission catalogue
    // ------------------------------------------------------------------
    for (const permission of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        update: {},
        create: {
          code: permission.code,
          module: permission.module,
          description: permission.description,
        },
      });
    }
    const permissionRows = await prisma.permission.findMany({
      where: { code: { in: PERMISSION_CATALOG.map((permission) => permission.code) } },
      select: { id: true },
    });
    console.log(
      `[generate-perf-dataset] permission catalogue ready (${permissionRows.length} codes)`,
    );

    // ------------------------------------------------------------------
    // Organization, modules, user, membership, role
    // ------------------------------------------------------------------
    await prisma.organization.create({
      data: {
        id: ORGANIZATION_ID,
        name: 'Performance Workspace',
        currencyCode: 'USD',
        defaultPaymentTermsDays: 30,
      },
    });
    await prisma.organizationModule.createMany({
      data: ['inventory', 'purchasing', 'sales', 'invoicing', 'reports'].map((moduleKey) => ({
        organizationId: ORGANIZATION_ID,
        moduleKey,
        enabled: true,
      })),
    });

    const userId = idFor('user', 0);
    const membershipId = idFor('membership', 0);
    const roleId = idFor('role', 0);
    const passwordHash = await argon2.hash(PERF_PASSWORD);

    await prisma.user.create({
      data: { id: userId, email: PERF_EMAIL, passwordHash },
    });
    await prisma.role.create({
      data: {
        id: roleId,
        organizationId: ORGANIZATION_ID,
        key: 'administrator',
        name: 'Administrator',
        description: 'Full access within the performance workspace',
        isSystem: true,
      },
    });
    await prisma.rolePermission.createMany({
      data: permissionRows.map((permission) => ({ roleId, permissionId: permission.id })),
    });
    await prisma.membership.create({
      data: {
        id: membershipId,
        userId,
        organizationId: ORGANIZATION_ID,
        name: 'Performance Owner',
        isActive: true,
      },
    });
    await prisma.membershipRole.create({
      data: { membershipId, roleId, organizationId: ORGANIZATION_ID },
    });

    console.log(`[generate-perf-dataset] workspace created (login: ${PERF_EMAIL})`);

    // ------------------------------------------------------------------
    // Catalogue: units, categories, warehouses, contacts, products
    // ------------------------------------------------------------------
    const unitDefinitions = [
      ['Piece', 'pc'],
      ['Kilogram', 'kg'],
      ['Litre', 'L'],
      ['Box', 'box'],
      ['Hour', 'h'],
    ];
    const unitIds = unitDefinitions.map((_, index) => idFor('unit', index));
    await prisma.unitOfMeasure.createMany({
      data: unitDefinitions.map(([name, abbreviation], index) => ({
        id: unitIds[index],
        organizationId: ORGANIZATION_ID,
        name,
        abbreviation,
      })),
    });

    const categoryNames = [
      'Beverages',
      'Snacks',
      'Bakery',
      'Dairy',
      'Frozen',
      'Produce',
      'Meat',
      'Seafood',
      'Household',
      'Stationery',
      'Electronics',
      'Hardware',
      'Garden',
      'Clothing',
      'Footwear',
      'Toys',
      'Pet supplies',
      'Health',
      'Beauty',
      'Automotive',
    ].slice(0, COUNTS.categories);
    const categoryIds = categoryNames.map((_, index) => idFor('category', index));
    await prisma.productCategory.createMany({
      data: categoryNames.map((name, index) => ({
        id: categoryIds[index],
        organizationId: ORGANIZATION_ID,
        name,
      })),
    });

    await prisma.warehouse.create({
      data: {
        id: idFor('warehouse', 0),
        organizationId: ORGANIZATION_ID,
        name: 'Main Warehouse',
        isDefault: true,
      },
    });
    const warehouseRows = [0, 1, 2].slice(0, COUNTS.warehouses).map((index) => ({
      id: idFor('warehouse', index),
      organizationId: ORGANIZATION_ID,
      name: index === 0 ? 'Main Warehouse' : `Depot ${index}`,
      isDefault: index === 0,
    }));
    if (warehouseRows.length > 1) {
      await prisma.warehouse.createMany({
        data: warehouseRows.slice(1),
      });
    }
    const warehouseIds = warehouseRows.map((warehouse) => warehouse.id);

    const contactDefinitions = [
      ...Array.from({ length: COUNTS.customers }, (_, index) => ({
        role: 'customer',
        index,
      })),
      ...Array.from({ length: COUNTS.suppliers }, (_, index) => ({
        role: 'supplier',
        index: COUNTS.customers + index,
      })),
      ...Array.from({ length: COUNTS.both }, (_, index) => ({
        role: 'both',
        index: COUNTS.customers + COUNTS.suppliers + index,
      })),
    ];
    const contactIds = contactDefinitions.map((contact) => idFor('contact', contact.index));
    const companyWords = ['North', 'Blue', 'Green', 'Prime', 'Metro', 'Cedar', 'Silver', 'Crown'];
    const companyKinds = ['Trading', 'Supplies', 'Market', 'Foods', 'Distributors', 'Group'];
    const cityNames = ['Cairo', 'Alexandria', 'Giza', 'Mansoura', 'Tanta', 'Aswan'];
    await insertAll(
      prisma.contact,
      contactDefinitions.map((contact, offset) => ({
        id: contactIds[offset],
        organizationId: ORGANIZATION_ID,
        code: `C-${String(contact.index + 1).padStart(5, '0')}`,
        name: `${pick(companyWords)} ${pick(companyKinds)} ${contact.index + 1}`,
        email: `contact${contact.index + 1}@example.com`,
        phone: `+20 100 ${String(contact.index).padStart(7, '0')}`,
        isCustomer: contact.role !== 'supplier',
        isSupplier: contact.role !== 'customer',
        city: pick(cityNames),
        country: 'Egypt',
        isArchived: random() < 0.04,
      })),
      'contacts',
    );
    const customerIds = contactDefinitions
      .filter((contact) => contact.role !== 'supplier')
      .map((contact) => idFor('contact', contact.index));
    const supplierIds = contactDefinitions
      .filter((contact) => contact.role !== 'customer')
      .map((contact) => idFor('contact', contact.index));

    const productWords = ['Atlas', 'Nova', 'Cedar', 'Aurora', 'Summit', 'Falcon', 'Orchid', 'Delta'];
    const productKinds = ['Bottle', 'Pack', 'Case', 'Box', 'Unit', 'Kit', 'Roll', 'Bag'];
    const products = Array.from({ length: COUNTS.products }, (_, index) => {
      const purchasePrice = randomInt(5_000, 400_000);
      const sellingPrice = Math.round(purchasePrice * 1.35);
      return {
        id: idFor('product', index),
        organizationId: ORGANIZATION_ID,
        sku: `SKU-${String(index + 1).padStart(6, '0')}`,
        name: `${pick(productWords)} ${pick(productKinds)} ${index + 1}`,
        categoryId: categoryIds[index % categoryIds.length],
        unitId: unitIds[index % unitIds.length],
        purchasePrice: price(purchasePrice),
        sellingPrice: price(sellingPrice),
        lowStockThreshold: index % 7 === 0 ? quantity(randomInt(5_000, 30_000)) : null,
        isArchived: random() < 0.06,
        _sellingPriceTenThousandths: sellingPrice,
      };
    });
    await insertAll(
      prisma.product,
      products.map(({ _sellingPriceTenThousandths, ...product }) => product),
      'products',
    );
    const productIds = products.map((product) => product.id);
    const sellingPriceById = new Map(
      products.map((product) => [product.id, product._sellingPriceTenThousandths]),
    );

    // ------------------------------------------------------------------
    // Purchase orders (1-3 lines each, never received)
    // ------------------------------------------------------------------
    const purchaseOrderRows = [];
    const purchaseOrderLineRows = [];
    let purchaseLineIndex = 0;
    for (let index = 0; index < COUNTS.purchaseOrders; index += 1) {
      const orderId = idFor('purchase-order', index);
      const lineCount = randomInt(1, 3);
      const chosenProducts = new Set();
      let totalCents = 0;
      for (let line = 0; line < lineCount; line += 1) {
        let productIndex = randomInt(0, productIds.length - 1);
        while (chosenProducts.has(productIndex)) {
          productIndex = (productIndex + 1) % productIds.length;
        }
        chosenProducts.add(productIndex);
        const product = products[productIndex];
        const quantityOrdered = randomInt(1_000, 25_000);
        const unitCost = Number(product.purchasePrice) * 10_000;
        const lineCents = lineTotalCents(quantityOrdered, Math.round(unitCost));
        totalCents += lineCents;
        purchaseOrderLineRows.push({
          id: idFor('purchase-order-line', purchaseLineIndex),
          organizationId: ORGANIZATION_ID,
          purchaseOrderId: orderId,
          productId: product.id,
          quantityOrdered: quantity(quantityOrdered),
          quantityReceived: '0.000',
          unitCost: product.purchasePrice,
          unitOfMeasure: unitDefinitions[productIndex % unitDefinitions.length][1],
          lineTotal: money(lineCents),
        });
        purchaseLineIndex += 1;
      }
      purchaseOrderRows.push({
        id: orderId,
        organizationId: ORGANIZATION_ID,
        number: `PO-${String(index + 1).padStart(6, '0')}`,
        supplierId: pick(supplierIds),
        warehouseId: pick(warehouseIds),
        status: ['DRAFT', 'CONFIRMED', 'CANCELLED'][index % 3],
        orderDate: dateAt(index % 240),
        expectedDate: dateAt((index % 240) + 7),
        notes: index % 11 === 0 ? 'Priority replenishment' : '',
        total: money(totalCents),
        createdById: userId,
      });
    }
    await insertAll(prisma.purchaseOrder, purchaseOrderRows, 'purchase orders');
    await insertAll(prisma.purchaseOrderLine, purchaseOrderLineRows, 'purchase order lines');

    // ------------------------------------------------------------------
    // Sales orders + invoices + lines
    // ------------------------------------------------------------------
    const salesOrderRows = [];
    const salesOrderLineRows = [];
    const invoiceRows = [];
    const invoiceLineRows = [];
    const paymentRows = [];
    const allocationRows = [];
    let salesLineIndex = 0;
    let invoiceLineIndex = 0;
    let paymentIndex = 0;

    for (let index = 0; index < COUNTS.invoices; index += 1) {
      const moneyBucket = index % 20;
      let invoiceStatus;
      if (moneyBucket <= 7) invoiceStatus = 'PAID';
      else if (moneyBucket <= 11) invoiceStatus = 'PARTIALLY_PAID';
      else if (moneyBucket <= 17) invoiceStatus = 'ISSUED';
      else if (moneyBucket === 18) invoiceStatus = 'DRAFT';
      else invoiceStatus = 'VOID';

      const salesOrderId = idFor('sales-order', index);
      const invoiceId = idFor('invoice', index);
      const customerId = pick(customerIds);
      const warehouseId = pick(warehouseIds);
      const lineCount = randomInt(1, 4);
      const chosenProducts = new Set();
      const orderDate = dateAt(index % 300);
      let totalCents = 0;

      for (let line = 0; line < lineCount; line += 1) {
        let productIndex = randomInt(0, productIds.length - 1);
        while (chosenProducts.has(productIndex)) {
          productIndex = (productIndex + 1) % productIds.length;
        }
        chosenProducts.add(productIndex);
        const product = products[productIndex];
        const quantityValue = randomInt(1_000, 12_000);
        const unitPrice = sellingPriceById.get(product.id) ?? 50_000;
        const lineCents = lineTotalCents(quantityValue, unitPrice);
        totalCents += lineCents;

        salesOrderLineRows.push({
          id: idFor('sales-order-line', salesLineIndex),
          organizationId: ORGANIZATION_ID,
          salesOrderId,
          productId: product.id,
          quantity: quantity(quantityValue),
          unitPrice: price(unitPrice),
          lineTotal: money(lineCents),
        });
        salesLineIndex += 1;

        invoiceLineRows.push({
          id: idFor('invoice-line', invoiceLineIndex),
          organizationId: ORGANIZATION_ID,
          invoiceId,
          productId: product.id,
          quantity: quantity(quantityValue),
          unitPrice: price(unitPrice),
          lineTotal: money(lineCents),
          sequence: line,
        });
        invoiceLineIndex += 1;
      }

      salesOrderRows.push({
        id: salesOrderId,
        organizationId: ORGANIZATION_ID,
        number: `SO-${String(index + 1).padStart(6, '0')}`,
        customerId,
        warehouseId,
        status: invoiceStatus === 'DRAFT' ? 'CONFIRMED' : 'SHIPPED',
        orderDate,
        notes: index % 13 === 0 ? 'Deliver before noon' : '',
        total: money(totalCents),
        createdById: userId,
      });

      const issued = !['DRAFT', 'VOID'].includes(invoiceStatus);
      const issueDate = issued ? dateAt((index % 300) + 2) : null;
      const dueDate = issued ? dateAt((index % 300) + 32) : null;

      invoiceRows.push({
        id: invoiceId,
        organizationId: ORGANIZATION_ID,
        number: issued ? `INV-${String(index + 1).padStart(6, '0')}` : null,
        salesOrderId,
        customerId,
        status: invoiceStatus,
        issueDate,
        dueDate,
        total: money(totalCents),
        createdById: userId,
        createdAt: issueDate ?? orderDate,
      });

      if (invoiceStatus === 'PAID') {
        const firstAmount = Math.max(1, Math.floor(totalCents / 2));
        const secondAmount = totalCents - firstAmount;
        const paymentAmounts = [firstAmount, secondAmount];
        for (const amount of paymentAmounts) {
          const paymentId = idFor('payment', paymentIndex);
          paymentRows.push({
            id: paymentId,
            organizationId: ORGANIZATION_ID,
            number: `PAY-${String(paymentIndex + 1).padStart(6, '0')}`,
            customerId,
            amount: money(amount),
            paymentDate: dateAt((index % 300) + 20),
            method: ['CASH', 'BANK_TRANSFER', 'CARD'][paymentIndex % 3],
            reference: `REF-${paymentIndex + 1}`,
            recordedById: userId,
          });
          allocationRows.push({
            id: idFor('payment-allocation', paymentIndex),
            organizationId: ORGANIZATION_ID,
            paymentId,
            invoiceId,
            amount: money(amount),
          });
          paymentIndex += 1;
        }
      } else if (invoiceStatus === 'PARTIALLY_PAID') {
        const amount = Math.max(1, Math.round(totalCents * 0.4));
        const paymentId = idFor('payment', paymentIndex);
        paymentRows.push({
          id: paymentId,
          organizationId: ORGANIZATION_ID,
          number: `PAY-${String(paymentIndex + 1).padStart(6, '0')}`,
          customerId,
          amount: money(amount),
          paymentDate: dateAt((index % 300) + 25),
          method: ['CASH', 'BANK_TRANSFER', 'CARD'][paymentIndex % 3],
          reference: `REF-${paymentIndex + 1}`,
          recordedById: userId,
        });
        allocationRows.push({
          id: idFor('payment-allocation', paymentIndex),
          organizationId: ORGANIZATION_ID,
          paymentId,
          invoiceId,
          amount: money(amount),
        });
        paymentIndex += 1;
      }
    }

    await insertAll(prisma.salesOrder, salesOrderRows, 'sales orders');
    await insertAll(prisma.salesOrderLine, salesOrderLineRows, 'sales order lines');
    await insertAll(prisma.invoice, invoiceRows, 'invoices');
    await insertAll(prisma.invoiceLine, invoiceLineRows, 'invoice lines');
    await insertAll(prisma.payment, paymentRows, 'payments');
    await insertAll(prisma.paymentAllocation, allocationRows, 'payment allocations');

    // ------------------------------------------------------------------
    // Stock: 20,000 movements over 1,000 product/warehouse pairs, and the
    // matching balances (on hand = sum of the movements).
    // ------------------------------------------------------------------
    const movementRows = [];
    const balanceRows = [];
    let movementIndex = 0;
    for (let productIndex = 0; productIndex < COUNTS.stockProducts; productIndex += 1) {
      for (let warehouseIndex = 0; warehouseIndex < COUNTS.stockWarehouses; warehouseIndex += 1) {
        const productId = productIds[productIndex];
        const warehouseId = warehouseIds[warehouseIndex];
        let onHand = 0;
        for (let movement = 0; movement < 20; movement += 1) {
          const isReceipt = movement === 0 || movement % 3 !== 0;
          const magnitude = isReceipt ? randomInt(2_000, 25_000) : randomInt(500, 4_000);
          let delta = isReceipt ? magnitude : -magnitude;
          if (onHand + delta < 0) delta = -onHand;
          if (delta === 0) delta = 1_000;
          onHand += delta;
          movementRows.push({
            id: idFor('stock-movement', movementIndex),
            organizationId: ORGANIZATION_ID,
            warehouseId,
            productId,
            type: isReceipt ? 'RECEIPT' : 'SHIPMENT',
            quantityDelta: quantity(delta),
            reason: null,
            note: null,
            sourceType: isReceipt ? 'RECEIPT' : 'SHIPMENT',
            sourceId: null,
            sourceNumber: null,
            userId,
            createdAt: dateAt((movementIndex % 400) + 1),
          });
          movementIndex += 1;
        }
        balanceRows.push({
          organizationId: ORGANIZATION_ID,
          warehouseId,
          productId,
          onHand: quantity(onHand),
          reserved: '0.000',
        });
      }
    }
    await insertAll(prisma.stockMovement, movementRows, 'stock movements');
    await insertAll(prisma.stockBalance, balanceRows, 'stock balances', 1_000);

    // ------------------------------------------------------------------
    // Document sequences reflect the numbers that were used.
    // ------------------------------------------------------------------
    await prisma.documentSequence.createMany({
      data: [
        { organizationId: ORGANIZATION_ID, name: 'invoice', currentValue: COUNTS.invoices },
        { organizationId: ORGANIZATION_ID, name: 'sales_order', currentValue: COUNTS.salesOrders },
        {
          organizationId: ORGANIZATION_ID,
          name: 'purchase_order',
          currentValue: COUNTS.purchaseOrders,
        },
        { organizationId: ORGANIZATION_ID, name: 'payment', currentValue: COUNTS.payments },
      ],
    });

    // ------------------------------------------------------------------
    // Verify the required minimums before declaring success.
    // ------------------------------------------------------------------
    const [productsCount, movementsCount, invoicesCount, salesOrdersCount, purchaseOrdersCount, paymentsCount] =
      await Promise.all([
        prisma.product.count({ where: { organizationId: ORGANIZATION_ID } }),
        prisma.stockMovement.count({ where: { organizationId: ORGANIZATION_ID } }),
        prisma.invoice.count({ where: { organizationId: ORGANIZATION_ID } }),
        prisma.salesOrder.count({ where: { organizationId: ORGANIZATION_ID } }),
        prisma.purchaseOrder.count({ where: { organizationId: ORGANIZATION_ID } }),
        prisma.payment.count({ where: { organizationId: ORGANIZATION_ID } }),
      ]);

    const required = {
      products: COUNTS.products,
      stockMovements: COUNTS.stockMovements,
      invoices: COUNTS.invoices,
      salesOrders: COUNTS.salesOrders,
      purchaseOrders: COUNTS.purchaseOrders,
      payments: COUNTS.payments,
    };
    const actual = {
      products: productsCount,
      stockMovements: movementsCount,
      invoices: invoicesCount,
      salesOrders: salesOrdersCount,
      purchaseOrders: purchaseOrdersCount,
      payments: paymentsCount,
    };
    for (const [key, minimum] of Object.entries(required)) {
      if (actual[key] < minimum) {
        throw new Error(`generated ${actual[key]} ${key}, expected at least ${minimum}`);
      }
    }

    console.log('[generate-perf-dataset] dataset complete:');
    for (const [key, value] of Object.entries(actual)) {
      console.log(`  ${key.padEnd(16)} ${value}`);
    }
    console.log(`[generate-perf-dataset] elapsed ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(
    `[generate-perf-dataset] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
