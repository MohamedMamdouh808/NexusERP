import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginAndChangePassword, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * Warehouses, end to end.
 *
 * A warehouse is a place the organization names itself: the name is its
 * identity and is unique without regard to capitalisation, exactly one
 * warehouse is the organization's default, a warehouse that still holds stock
 * or is the default cannot be deactivated, and every change carries the version
 * the caller read so two administrators cannot overwrite each other.
 */
describe('Inventory warehouses: end to end', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let otherCookie: string;
  let categoryId: string;
  let unitId: string;
  let productId: string;

  let keyCounter = 0;
  const nextKey = (): string => `warehouse-key-${Date.now()}-${(keyCounter += 1)}`;

  /** The admin's warehouses, re-read before every assertion about state. */
  const listWarehouses = async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    return res.body as {
      items: Array<{
        id: string;
        name: string;
        isActive: boolean;
        isDefault: boolean;
        version: number;
      }>;
      total: number;
    };
  };

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-warehouses-${Date.now()}@example.com`;
    const reg1 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg1.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-warehouses-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);
    otherCookie = await loginForCookies(app, otherEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Hardware' })
      .expect(201);
    categoryId = category.body.id;

    const unit = await request(app.getHttpServer())
      .post('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .send({ name: 'Each', abbreviation: 'ea' })
      .expect(201);
    unitId = unit.body.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-WHS-1',
        name: 'Warehouse Drill',
        categoryId,
        unitId,
        purchasePrice: '4.5000',
        sellingPrice: '9.9900',
      })
      .expect(201);
    productId = product.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates, renames, deactivates and reactivates a warehouse', async () => {
    // A name is required; an empty one is a mistake in the request.
    await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: '   ' })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Riverside Depot' })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Riverside Depot',
      isActive: true,
      isDefault: false,
      version: 1,
    });
    const warehouseId = created.body.id as string;

    const renamed = await request(app.getHttpServer())
      .put(`/api/v1/warehouses/${warehouseId}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Riverside Hub', isDefault: false, version: 1 })
      .expect(200);
    expect(renamed.body).toMatchObject({ name: 'Riverside Hub', version: 2 });

    const deactivated = await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${warehouseId}/deactivate`)
      .set('Cookie', adminCookie)
      .send({ version: 2 })
      .expect(200);
    expect(deactivated.body).toMatchObject({ isActive: false, version: 3 });

    const reactivated = await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${warehouseId}/reactivate`)
      .set('Cookie', adminCookie)
      .send({ version: 3 })
      .expect(200);
    expect(reactivated.body).toMatchObject({ isActive: true, version: 4 });

    const listed = await listWarehouses();
    const warehouse = listed.items.find((item) => item.id === warehouseId);
    expect(warehouse).toMatchObject({ name: 'Riverside Hub', isActive: true, version: 4 });
  });

  it('refuses a name that another warehouse already uses, whatever its case', async () => {
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'riverside hub' })
      .expect(409);
    expect(duplicate.body.code).toBe('DUPLICATE_RECORD');
    expect(duplicate.body.details[0]).toMatchObject({ field: 'name', code: 'DUPLICATE' });

    // The same rule protects a rename: another warehouse cannot take the
    // default's name either, in any capitalisation.
    const listed = await listWarehouses();
    const another = listed.items.find((item) => item.name === 'Riverside Hub')!;

    const renamed = await request(app.getHttpServer())
      .put(`/api/v1/warehouses/${another.id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'DEFAULT WAREHOUSE', isDefault: false, version: another.version })
      .expect(409);
    expect(renamed.body.code).toBe('DUPLICATE_RECORD');
  });

  it('keeps exactly one default warehouse in the organization', async () => {
    // Creating a default demotes the previous one.
    const first = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Main Hub', isDefault: true })
      .expect(201);
    expect(first.body.isDefault).toBe(true);

    let listed = await listWarehouses();
    expect(listed.items.filter((item) => item.isDefault)).toHaveLength(1);
    expect(listed.items.find((item) => item.name === 'Default Warehouse')?.isDefault).toBe(false);

    const second = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Annex', isDefault: true })
      .expect(201);

    listed = await listWarehouses();
    expect(listed.items.filter((item) => item.isDefault)).toHaveLength(1);
    expect(listed.items.find((item) => item.name === 'Main Hub')?.isDefault).toBe(false);

    // The default cannot be demoted by an update: the organization keeps one.
    const annex = listed.items.find((item) => item.id === second.body.id)!;
    const demoted = await request(app.getHttpServer())
      .put(`/api/v1/warehouses/${annex.id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Annex', isDefault: false, version: annex.version })
      .expect(409);
    expect(demoted.body.details[0]).toMatchObject({ code: 'LAST_DEFAULT_WAREHOUSE' });
  });

  it('refuses to deactivate the default warehouse', async () => {
    const listed = await listWarehouses();
    const current = listed.items.find((item) => item.isDefault)!;

    const refused = await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${current.id}/deactivate`)
      .set('Cookie', adminCookie)
      .send({ version: current.version })
      .expect(409);
    expect(refused.body.code).toBe('CONFLICT');
    expect(refused.body.details[0]).toMatchObject({
      field: 'isDefault',
      code: 'DEFAULT_WAREHOUSE',
    });

    // The default is untouched.
    const after = await listWarehouses();
    expect(after.items.find((item) => item.id === current.id)).toMatchObject({
      isActive: true,
      version: current.version,
    });
  });

  it('refuses to deactivate a warehouse that still holds stock', async () => {
    const coldStore = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Cold Store' })
      .expect(201);

    // The warehouse takes stock, and then it cannot be deactivated.
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({
        warehouseId: coldStore.body.id,
        productId,
        quantity: '2.000',
        reason: 'FOUND',
      })
      .expect(201);

    const refused = await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${coldStore.body.id}/deactivate`)
      .set('Cookie', adminCookie)
      .send({ version: coldStore.body.version })
      .expect(409);
    expect(refused.body.code).toBe('WAREHOUSE_IN_USE');
    expect(refused.body.details[0]).toMatchObject({ field: 'warehouseId' });
  });

  it('lets exactly one of two simultaneous updates with the same version through', async () => {
    const harborBay = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Harbor Bay' })
      .expect(201);
    const harborId = harborBay.body.id as string;
    const version = harborBay.body.version as number;

    const results = await Promise.allSettled([
      request(app.getHttpServer())
        .put(`/api/v1/warehouses/${harborId}`)
        .set('Cookie', adminCookie)
        .send({ name: 'Harbor Bay East', isDefault: false, version }),
      request(app.getHttpServer())
        .put(`/api/v1/warehouses/${harborId}`)
        .set('Cookie', adminCookie)
        .send({ name: 'Harbor Bay West', isDefault: false, version }),
    ]);

    const statuses = results.map((outcome) =>
      outcome.status === 'fulfilled' ? outcome.value.status : 0,
    );
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(1);

    const conflict = results.find(
      (outcome) => outcome.status === 'fulfilled' && outcome.value.status === 409,
    ) as
      | { status: 'fulfilled'; value: { body: { code: string; details: Array<{ code: string }> } } }
      | undefined;
    expect(conflict?.value.body.code).toBe('STALE_VERSION');
    expect(conflict?.value.body.details[0]).toMatchObject({ code: 'STALE_VERSION' });

    // The winner's change stands, and the version moved exactly one step.
    const listed = await listWarehouses();
    expect(listed.items.find((item) => item.id === harborId)).toMatchObject({
      version: version + 1,
    });
  });

  it('isolates organizations and enforces permissions on every warehouse endpoint', async () => {
    const listed = await listWarehouses();
    const mine = listed.items.find((item) => item.name === 'Riverside Hub')!;

    // Another organization's list is empty, and my warehouse does not exist
    // for its admin.
    const otherList = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', otherCookie)
      .expect(200);
    const otherItems = (otherList.body as { items: Array<{ id: string }> }).items;
    expect(otherItems.some((item) => item.id === mine.id)).toBe(false);

    await request(app.getHttpServer())
      .put(`/api/v1/warehouses/${mine.id}`)
      .set('Cookie', otherCookie)
      .send({ name: 'Hijacked', isDefault: false, version: mine.version })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${mine.id}/deactivate`)
      .set('Cookie', otherCookie)
      .send({ version: mine.version })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${mine.id}/reactivate`)
      .set('Cookie', otherCookie)
      .send({ version: mine.version })
      .expect(404);

    // An anonymous caller is not told anything.
    await request(app.getHttpServer()).get('/api/v1/warehouses').expect(401);

    // A caller without inventory.write may read, but not change.
    const salesRole = await prisma.role.findFirst({
      where: { organizationId: adminOrgId, key: 'sales' },
    });
    const memberEmail = `sales-warehouses-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: memberEmail,
        name: 'Warehouse Reader',
        password: 'Password1234',
        roleIds: [salesRole!.id],
      })
      .expect(201);
    const salesCookie = await loginAndChangePassword(app, memberEmail, 'Password1234');

    await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', salesCookie)
      .expect(200);

    const forbiddenCreate = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', salesCookie)
      .send({ name: 'Forbidden Depot' })
      .expect(403);
    expect(forbiddenCreate.body.code).toBe('FORBIDDEN');

    await request(app.getHttpServer())
      .put(`/api/v1/warehouses/${mine.id}`)
      .set('Cookie', salesCookie)
      .send({ name: 'Forbidden Rename', isDefault: false, version: mine.version })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${mine.id}/deactivate`)
      .set('Cookie', salesCookie)
      .send({ version: mine.version })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${mine.id}/reactivate`)
      .set('Cookie', salesCookie)
      .send({ version: mine.version })
      .expect(403);
  });
});
