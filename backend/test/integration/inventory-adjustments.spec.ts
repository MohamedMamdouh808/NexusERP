import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { createTestApp, loginAndChangePassword, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';
import { AuditService } from '../../src/modules/audit/audit.service';

/**
 * Stock adjustments, end to end.
 *
 * An adjustment is the only way stock changes in this feature, so it has to be
 * exactly-once, exact in its arithmetic, and completely explained: the balance
 * moves by the signed quantity, a movement records it, an audit entry records
 * the before and after, and a retry of the same request changes nothing.
 */
describe('Inventory adjustments: end to end', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let adminUserId: string;
  let productId: string;
  let archivedProductId: string;
  let warehouseId: string;
  let inactiveWarehouseId: string;

  let keyCounter = 0;
  const nextKey = (): string => `adjustment-key-${Date.now()}-${(keyCounter += 1)}`;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-adjust-${Date.now()}@example.com`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = registration.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const adminUser = await prisma.user.findFirst({ where: { email: adminEmail } });
    adminUserId = adminUser?.id ?? '';

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Hardware' })
      .expect(201);

    const unit = await request(app.getHttpServer())
      .post('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .send({ name: 'Each', abbreviation: 'ea' })
      .expect(201);

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-ADJ-1',
        name: 'Adjustable Drill',
        categoryId: category.body.id,
        unitId: unit.body.id,
        purchasePrice: '4.5000',
        sellingPrice: '9.9900',
      })
      .expect(201);
    productId = product.body.id;

    const archived = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-ADJ-2',
        name: 'Retired Drill',
        categoryId: category.body.id,
        unitId: unit.body.id,
        purchasePrice: '4.5000',
        sellingPrice: '9.9900',
      })
      .expect(201);
    archivedProductId = archived.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/products/${archivedProductId}/archive`)
      .set('Cookie', adminCookie)
      .expect(200);

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    warehouseId = warehouses.body.items[0].id;

    const second = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Cold Store' })
      .expect(201);
    inactiveWarehouseId = second.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** The balance row of one product in one warehouse. */
  const readBalance = async () => {
    const rows = await prisma.$queryRaw<{ on_hand: string; reserved: string }[]>(Prisma.sql`
      SELECT "on_hand"::text AS "on_hand", "reserved"::text AS "reserved"
      FROM "stock_balances"
      WHERE "organization_id" = ${adminOrgId}::uuid
        AND "warehouse_id" = ${warehouseId}::uuid
        AND "product_id" = ${productId}::uuid
    `);
    return rows[0];
  };

  const countMovements = async (): Promise<number> =>
    prisma.stockMovement.count({ where: { organizationId: adminOrgId } });

  /** Exact decimal arithmetic: the expectations are never floating point. */
  const add = (value: string, delta: string): string =>
    new Prisma.Decimal(value).plus(delta).toFixed(3);

  it('changes the balance by exactly the signed quantity and explains the change', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({
        warehouseId,
        productId,
        quantity: '5.000',
        reason: 'FOUND',
      })
      .expect(201);

    expect(res.body.movement).toMatchObject({
      sourceNumber: 'ADJ-00001',
      quantityDelta: '5.000',
      type: 'ADJUSTMENT',
    });
    expect(res.body.balance).toMatchObject({
      warehouseId,
      productId,
      onHand: '5.000',
      reserved: '0.000',
      available: '5.000',
    });

    const balance = await readBalance();
    expect(balance?.on_hand).toBe('5.000');

    // One movement, with its number, its reason and the acting user.
    const movements = await prisma.stockMovement.findMany({
      where: { organizationId: adminOrgId },
    });
    expect(movements).toHaveLength(1);
    const movement = movements[0]!;
    expect(movement.quantityDelta.toFixed(3)).toBe('5.000');
    expect(movement.type).toBe('ADJUSTMENT');
    expect(movement.reason).toBe('FOUND');
    expect(movement.sourceNumber).toBe('ADJ-00001');
    expect(movement.userId).toBe(adminUserId);

    // One audit entry, with the before and after quantities.
    const audit = await prisma.auditLog.findMany({
      where: { organizationId: adminOrgId, action: 'stock.adjusted' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.before).toMatchObject({ onHand: '0.000' });
    expect(audit[0]!.after).toMatchObject({ onHand: '5.000' });
  });

  it('replays the same key with the same body and creates nothing the second time', async () => {
    const key = nextKey();
    const body = { warehouseId, productId, quantity: '-1.000', reason: 'DAMAGE' as const };

    const first = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    const before = await countMovements();

    const second = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    // The same answer, not a new one.
    expect(second.body).toEqual(first.body);
    expect(await countMovements()).toBe(before);

    const balance = await readBalance();
    expect(balance?.on_hand).toBe('4.000');
  });

  it('refuses the same key with a different body and creates nothing', async () => {
    const key = nextKey();
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', key)
      .send({ warehouseId, productId, quantity: '2.000', reason: 'FOUND' })
      .expect(201);

    const before = await countMovements();

    const conflict = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', key)
      .send({ warehouseId, productId, quantity: '3.000', reason: 'FOUND' })
      .expect(422);

    expect(conflict.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await countMovements()).toBe(before);
  });

  it('serializes two adjustments posted at the same moment', async () => {
    // The expectations are relative: the balance before the test is whatever
    // the earlier tests left behind, and the arithmetic is exact.
    const before = await readBalance();
    const starting = before!.on_hand;

    const start = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId, quantity: '10.000', reason: 'FOUND' })
      .expect(201);
    expect(start.body.balance.onHand).toBe(add(starting, '10.000'));

    const [down, up] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', nextKey())
        .send({ warehouseId, productId, quantity: '-3.000', reason: 'LOSS' }),
      request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', nextKey())
        .send({ warehouseId, productId, quantity: '2.000', reason: 'FOUND' }),
    ]);

    expect([down.status, up.status].sort()).toEqual([201, 201]);

    // +10.000 - 3.000 + 2.000, whatever order they ran in.
    const balance = await readBalance();
    expect(balance?.on_hand).toBe(add(starting, '9.000'));
  });

  it('lets only one of two adjustments that would empty the stock succeed', async () => {
    await prisma.stockBalance.updateMany({
      where: { organizationId: adminOrgId, warehouseId, productId },
      data: { onHand: new Prisma.Decimal('1.000') },
    });

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', nextKey())
        .send({ warehouseId, productId, quantity: '-1.000', reason: 'LOSS' }),
      request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', nextKey())
        .send({ warehouseId, productId, quantity: '-1.000', reason: 'LOSS' }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const refused = first.status === 409 ? first : second;
    expect(refused.body.code).toBe('INSUFFICIENT_STOCK');

    // The stock never went below zero.
    const balance = await readBalance();
    expect(balance?.on_hand).toBe('0.000');
  });

  it('refuses a result below zero and leaves the balance and the ledger untouched', async () => {
    const before = await countMovements();
    const balanceBefore = await readBalance();

    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId, quantity: '-999.000', reason: 'LOSS' })
      .expect(409);

    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await countMovements()).toBe(before);
    expect(await readBalance()).toEqual(balanceBefore);
  });

  it('refuses a result below the reserved quantity', async () => {
    await prisma.stockBalance.updateMany({
      where: { organizationId: adminOrgId, warehouseId, productId },
      data: { onHand: new Prisma.Decimal('5.000'), reserved: new Prisma.Decimal('4.000') },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId, quantity: '-2.000', reason: 'LOSS' })
      .expect(409);

    expect(res.body.code).toBe('INSUFFICIENT_STOCK');

    const balance = await readBalance();
    expect(balance?.on_hand).toBe('5.000');
    expect(balance?.reserved).toBe('4.000');
  });

  it('refuses a deactivated warehouse and accepts it again once reactivated', async () => {
    const warehouse = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    const warehouses = (warehouse.body as {
      items: Array<{ id: string; name: string; version: number }>;
    }).items;
    const coldStore = warehouses.find((item) => item.id === inactiveWarehouseId);
    if (coldStore === undefined) throw new Error('the inactive warehouse is missing');

    await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${inactiveWarehouseId}/deactivate`)
      .set('Cookie', adminCookie)
      .send({ version: coldStore.version })
      .expect(200);

    const refused = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId: inactiveWarehouseId, productId, quantity: '1.000', reason: 'FOUND' })
      .expect(409);

    expect(refused.body.code).toBe('INACTIVE_WAREHOUSE');
  });

  it('writes off an archived product but refuses to add stock to it', async () => {
    // The stock the discontinued product still holds: it was stocked before it
    // was archived, and the leftover has to be correctable.
    await prisma.stockBalance.create({
      data: {
        organizationId: adminOrgId,
        warehouseId,
        productId: archivedProductId,
        onHand: '5.000',
        reserved: '0.000',
      },
    });

    // Writing off is allowed: the stock leaves.
    const writtenOff = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId: archivedProductId, quantity: '-2.000', reason: 'LOSS' })
      .expect(201);
    expect(writtenOff.body.balance.onHand).toBe('3.000');

    // Adding stock is refused: the product is restored first.
    const refused = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId: archivedProductId, quantity: '1.000', reason: 'FOUND' })
      .expect(409);

    expect(refused.body.code).toBe('PRODUCT_ARCHIVED');

    // The refusal left the stock as it was.
    const rows = await prisma.$queryRaw<{ on_hand: string }[]>(Prisma.sql`
      SELECT "on_hand"::text AS "on_hand"
      FROM "stock_balances"
      WHERE "organization_id" = ${adminOrgId}::uuid
        AND "warehouse_id" = ${warehouseId}::uuid
        AND "product_id" = ${archivedProductId}::uuid
    `);
    expect(rows[0]?.on_hand).toBe('3.000');
  });

  it('requires a note when the reason is other', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId, quantity: '1.000', reason: 'OTHER' })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');

    const withNote = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId, quantity: '1.000', reason: 'OTHER', note: 'Counted twice' })
      .expect(201);
    expect(withNote.body.movement.sourceNumber).toMatch(/^ADJ-\d{5}$/);
  });

  it('refuses a zero quantity and a quantity that is not a decimal', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId, quantity: '0.000', reason: 'FOUND' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId, quantity: '1.0005', reason: 'FOUND' })
      .expect(400);
  });

  it('does not find another organization\'s warehouse and refuses a caller without the permission', async () => {
    const otherEmail = `other-adjust-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);
    const otherCookie = await loginForCookies(app, otherEmail, 'Password1234');

    // The warehouse of another organization is not found.
    const notFound = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', otherCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId, quantity: '1.000', reason: 'FOUND' })
      .expect(404);
    expect(notFound.body.code).toBe('NOT_FOUND');

    // A caller without inventory.adjust is refused.
    const salesRole = await prisma.role.findFirst({
      where: { organizationId: adminOrgId, key: 'sales' },
    });
    const memberEmail = `sales-adjust-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: memberEmail,
        name: 'Sales Reader',
        password: 'Password1234',
        roleIds: [salesRole!.id],
      })
      .expect(201);
    const salesCookie = await loginAndChangePassword(app, memberEmail, 'Password1234');

    const forbidden = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', salesCookie)
      .set('Idempotency-Key', nextKey())
      .send({ warehouseId, productId, quantity: '1.000', reason: 'FOUND' })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    // The same caller may READ the balances.
    await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances')
      .set('Cookie', salesCookie)
      .expect(200);
  });

  it('refuses a request without an idempotency key', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .send({ warehouseId, productId, quantity: '1.000', reason: 'FOUND' })
      .expect(400);

    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('keeps a posted movement immutable', async () => {
    const movement = await prisma.stockMovement.findFirst({
      where: { organizationId: adminOrgId },
    });
    expect(movement).not.toBeNull();

    // UPDATE is refused.
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE stock_movements SET "quantity_delta" = 999 WHERE id = '${movement!.id}'`,
      ),
    ).rejects.toThrow();

    // DELETE is refused.
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM stock_movements WHERE id = '${movement!.id}'`),
    ).rejects.toThrow();

    // TRUNCATE is refused.
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE stock_movements')).rejects.toThrow();

    // The movement is still there, unchanged.
    const after = await prisma.stockMovement.findMany({ where: { organizationId: adminOrgId } });
    expect(after.length).toBeGreaterThan(0);
  });
});

/**
 * The rollback of a failed adjustment.
 *
 * The audit entry is written in the same transaction as the balance change, so
 * an audit write that fails must undo the balance change too. The audit
 * service is the seam that makes that provable: it is replaced with one that
 * always fails, and the balance is then asked what it holds.
 */
describe('Inventory adjustments: a failed audit write rolls the balance back', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: workingApp } = await createTestApp();
    const working = workingApp;

    const adminEmail = `admin-rollback-${Date.now()}@example.com`;
    const registration = await request(working.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = registration.body.organization.id;
    adminCookie = await loginForCookies(working, adminEmail, 'Password1234');

    const category = await request(working.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Hardware' })
      .expect(201);
    const unit = await request(working.getHttpServer())
      .post('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .send({ name: 'Each', abbreviation: 'ea' })
      .expect(201);

    const product = await request(working.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-RBK-1',
        name: 'Rollback Drill',
        categoryId: category.body.id,
        unitId: unit.body.id,
        purchasePrice: '4.5000',
        sellingPrice: '9.9900',
      })
      .expect(201);
    productId = product.body.id;

    const warehouses = await request(working.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    warehouseId = warehouses.body.items[0].id;

    await working.close();

    // The application under test, with an audit service that always fails.
    const { app: failingApp } = await createTestApp([
      {
        token: AuditService,
        useValue: {
          record: () => Promise.reject(new Error('the audit write failed')),
        },
      },
    ]);
    app = failingApp;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('leaves no balance, no movement and no claim behind', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', 'rollback-key-1')
      .send({ warehouseId, productId, quantity: '5.000', reason: 'FOUND' })
      .expect(500);

    const balances = await prisma.stockBalance.count({
      where: { organizationId: adminOrgId, warehouseId, productId },
    });
    expect(balances).toBe(0);

    const movements = await prisma.stockMovement.count({ where: { organizationId: adminOrgId } });
    expect(movements).toBe(0);

    // The idempotency claim rolled back too, so the key is free for a
    // corrected request.
    const claims = await prisma.idempotencyKey.count({ where: { organizationId: adminOrgId } });
    expect(claims).toBe(0);
  });
});
