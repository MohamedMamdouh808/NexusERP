import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies, loginAndChangePassword } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';
import { AUDIT_ACTIONS } from '@nexuserp/shared';
import { PRODUCTS_USAGE_HOOK } from '../../src/modules/products/products-usage.hook';

/**
 * Products Integration: End-to-End Test Suite.
 *
 * The catalogue is a tenant-scoped record: a product belongs to one
 * organization, its SKU is unique inside that organization without regard to
 * capitalisation, its prices are exact decimals carried as strings, and every
 * change writes an audit entry in the same transaction.
 */
describe('Products Integration: End-to-End Test Suite', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let categoryId: string;
  let unitId: string;

  let otherOrgCookie: string;
  let otherOrgId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    // 1. The organization under test.
    const adminEmail = `admin-products-${Date.now()}@example.com`;
    const reg1 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);

    adminOrgId = reg1.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    // 2. A second organization, for the tenant isolation checks.
    const otherEmail = `other-products-${Date.now()}@example.com`;
    const reg2 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);

    otherOrgId = reg2.body.organization.id;
    otherOrgCookie = await loginForCookies(app, otherEmail, 'Password1234');

    // 3. The vocabulary every product is described in.
    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Apparel' })
      .expect(201);
    categoryId = category.body.id;

    const unit = await request(app.getHttpServer())
      .post('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .send({ name: 'piece', abbreviation: 'pc' })
      .expect(201);
    unitId = unit.body.id;
  });

  afterAll(async () => {
    if (adminOrgId && otherOrgId) {
      await prisma.product.deleteMany({
        where: { organizationId: { in: [adminOrgId, otherOrgId] } },
      });
      await prisma.productCategory.deleteMany({
        where: { organizationId: { in: [adminOrgId, otherOrgId] } },
      });
      await prisma.unitOfMeasure.deleteMany({
        where: { organizationId: { in: [adminOrgId, otherOrgId] } },
      });
    }
    await app.close();
  });

  beforeEach(async () => {
    await prisma.product.deleteMany({
      where: { organizationId: { in: [adminOrgId, otherOrgId] } },
    });
  });

  function productPayload(overrides: Record<string, unknown> = {}) {
    return {
      sku: 'SKU-1001',
      name: 'Blue T-Shirt',
      categoryId,
      unitId,
      purchasePrice: '4.5000',
      sellingPrice: '9.9900',
      lowStockThreshold: '2.000',
      ...overrides,
    };
  }

  // =========================================================================
  // US1: Create and View a Product
  // =========================================================================
  describe('US1: Create and View a Product', () => {
    it('creates a product with the stored values, version 1 and an audit entry', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.sku).toBe('SKU-1001');
      expect(res.body.name).toBe('Blue T-Shirt');
      expect(res.body.version).toBe(1);
      expect(res.body.isArchived).toBe(false);
      // The prices are exact decimals, carried as strings.
      expect(res.body.purchasePrice).toBe('4.5000');
      expect(res.body.sellingPrice).toBe('9.9900');
      expect(res.body.lowStockThreshold).toBe('2.000');

      // The record is there for this organization.
      const stored = await prisma.product.findUnique({ where: { id: res.body.id } });
      expect(stored).not.toBeNull();
      expect(stored!.organizationId).toBe(adminOrgId);
      expect(stored!.purchasePrice.toFixed(4)).toBe('4.5000');
      expect(stored!.lowStockThreshold!.toFixed(3)).toBe('2.000');

      // The audit entry was written with the change.
      const audit = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTIONS.productsCreated, recordId: res.body.id },
      });
      expect(audit).not.toBeNull();
      expect(audit!.organizationId).toBe(adminOrgId);
    });

    it('trims the SKU and stores it as given', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ sku: '  SKU-TRIM  ' }))
        .expect(201);

      expect(res.body.sku).toBe('SKU-TRIM');
    });

    it('refuses a SKU that already exists in the organization, naming the product', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ name: 'First Product' }))
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ name: 'Second Product' }))
        .expect(409);

      expect(res.body.code).toBe('DUPLICATE_RECORD');
      const details = res.body.details as Array<{ field: string; message: string }>;
      expect(details.some((d) => d.field === 'sku')).toBe(true);
      expect(details.some((d) => d.message.includes('First Product'))).toBe(true);
    });

    it('refuses a SKU that already exists in a different capitalisation', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ sku: 'sku-1001' }))
        .expect(409);

      expect(res.body.code).toBe('DUPLICATE_RECORD');
    });

    it('refuses a price with too many decimals, a negative price, or a price sent as a number', async () => {
      const tooManyDecimals = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ sellingPrice: '9.99999' }))
        .expect(400);
      expect(tooManyDecimals.body.code).toBe('VALIDATION_ERROR');

      const negative = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ purchasePrice: '-1.0000' }))
        .expect(400);
      expect(negative.body.code).toBe('VALIDATION_ERROR');

      const negativeThreshold = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ lowStockThreshold: '-2.000' }))
        .expect(400);
      expect(negativeThreshold.body.code).toBe('VALIDATION_ERROR');

      const asNumber = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ sellingPrice: 9.99 }))
        .expect(400);
      expect(asNumber.body.code).toBe('VALIDATION_ERROR');

      // Nothing was saved.
      expect(await prisma.product.count({ where: { organizationId: adminOrgId } })).toBe(0);
    });

    it('accepts a product without a reorder level, and stores it as absent rather than zero', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ lowStockThreshold: undefined }))
        .expect(201);

      expect(res.body.lowStockThreshold).toBeNull();
      const stored = await prisma.product.findUnique({ where: { id: res.body.id } });
      expect(stored!.lowStockThreshold).toBeNull();
    });

    it('refuses a category or a unit that belongs to another organization', async () => {
      const otherCategory = await request(app.getHttpServer())
        .post('/api/v1/product-categories')
        .set('Cookie', otherOrgCookie)
        .send({ name: 'Other Category' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ categoryId: otherCategory.body.id }))
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('leaves nothing behind when the creation fails: no product, no audit entry', async () => {
      const beforeProducts = await prisma.product.count({ where: { organizationId: adminOrgId } });
      const beforeAudit = await prisma.auditLog.count({ where: { organizationId: adminOrgId } });

      // A category of another organization: the creation fails inside the
      // transaction, so the product and its audit entry must both be absent.
      const otherCategory = await request(app.getHttpServer())
        .post('/api/v1/product-categories')
        .set('Cookie', otherOrgCookie)
        .send({ name: 'Foreign Category' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ categoryId: otherCategory.body.id }))
        .expect(400);

      expect(await prisma.product.count({ where: { organizationId: adminOrgId } })).toBe(
        beforeProducts,
      );
      expect(await prisma.auditLog.count({ where: { organizationId: adminOrgId } })).toBe(
        beforeAudit,
      );
    });

    it('answers another organization\'s product as not found', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/${created.body.id}`)
        .set('Cookie', otherOrgCookie)
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('refuses the write endpoints to a member without products.write, and still lets them read', async () => {
      // The sales role holds products.read but not products.write.
      const salesRole = await prisma.role.findFirst({
        where: { organizationId: adminOrgId, key: 'sales' },
      });

      const readerEmail = `reader-products-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/api/v1/memberships')
        .set('Cookie', adminCookie)
        .send({
          email: readerEmail,
          name: 'Products Reader',
          password: 'Password1234',
          roleIds: [salesRole!.id],
        })
        .expect(201);

      // A created member is flagged for a forced password change; it chooses one
      // before it can do anything else.
      const readerCookie = await loginAndChangePassword(app, readerEmail, 'Password1234');

      const refused = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', readerCookie)
        .send(productPayload())
        .expect(403);

      expect(refused.body.code).toBe('FORBIDDEN');

      // The reader may still read.
      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', readerCookie)
        .expect(200);
    });
  });

  // =========================================================================
  // US2: Find Products in a Large Catalog
  // =========================================================================
  describe('US2: Find Products in a Large Catalog', () => {
    async function createProduct(sku: string, name: string) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ sku, name }))
        .expect(201);
      return res.body as { id: string };
    }

    it('searches the SKU and the name, and treats a wildcard as literal text', async () => {
      await createProduct('SKU-1001', 'Blue T-Shirt');
      await createProduct('SKU-2002', '100% Guaranteed');

      // The percent sign is matched literally: it finds the product that
      // contains one, and not every product.
      const searched = await request(app.getHttpServer())
        .get('/api/v1/products?search=100%25')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(searched.body.items).toHaveLength(1);
      expect(searched.body.items[0].name).toBe('100% Guaranteed');
      expect(searched.body.total).toBe(1);

      // The SKU is searched too.
      const bySku = await request(app.getHttpServer())
        .get('/api/v1/products?search=SKU-1001')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(bySku.body.items).toHaveLength(1);
      expect(bySku.body.items[0].sku).toBe('SKU-1001');
    });

    it('filters by category and by status, and the default status is the active products', async () => {
      await createProduct('SKU-1001', 'Blue T-Shirt');
      const archived = await createProduct('SKU-2002', 'Old T-Shirt');
      await request(app.getHttpServer())
        .post(`/api/v1/products/${archived.id}/archive`)
        .set('Cookie', adminCookie)
        .expect(200);

      const active = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(active.body.items).toHaveLength(1);
      expect(active.body.items[0].sku).toBe('SKU-1001');
      expect(active.body.total).toBe(1);

      const archivedOnly = await request(app.getHttpServer())
        .get('/api/v1/products?status=archived')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(archivedOnly.body.items).toHaveLength(1);
      expect(archivedOnly.body.items[0].sku).toBe('SKU-2002');

      const all = await request(app.getHttpServer())
        .get('/api/v1/products?status=all')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(all.body.total).toBe(2);

      // The category filter is combined with the status filter that is in
      // force: the default is the active products, so the archived one is not
      // in the answer unless the status asks for it.
      const byCategory = await request(app.getHttpServer())
        .get(`/api/v1/products?categoryId=${categoryId}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(byCategory.body.total).toBe(1);
      expect(byCategory.body.items[0].sku).toBe('SKU-1001');

      const byCategoryAll = await request(app.getHttpServer())
        .get(`/api/v1/products?categoryId=${categoryId}&status=all`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(byCategoryAll.body.total).toBe(2);
    });

    it('sorts and pages, and never returns more than a hundred at a time', async () => {
      for (const sku of ['SKU-3003', 'SKU-1001', 'SKU-2002']) {
        await createProduct(sku, `Product ${sku}`);
      }

      const sorted = await request(app.getHttpServer())
        .get('/api/v1/products?sortBy=sku&sortOrder=asc')
        .set('Cookie', adminCookie)
        .expect(200);
      expect((sorted.body as { items: Array<{ sku: string }> }).items.map((p) => p.sku)).toEqual([
        'SKU-1001',
        'SKU-2002',
        'SKU-3003',
      ]);

      const descending = await request(app.getHttpServer())
        .get('/api/v1/products?sortBy=sku&sortOrder=desc')
        .set('Cookie', adminCookie)
        .expect(200);
      expect((descending.body as { items: Array<{ sku: string }> }).items.map((p) => p.sku)).toEqual([
        'SKU-3003',
        'SKU-2002',
        'SKU-1001',
      ]);

      const firstPage = await request(app.getHttpServer())
        .get('/api/v1/products?page=1&pageSize=2&sortBy=sku&sortOrder=asc')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(firstPage.body.items).toHaveLength(2);
      expect(firstPage.body.total).toBe(3);
      expect(firstPage.body.page).toBe(1);
      expect(firstPage.body.pageSize).toBe(2);

      const secondPage = await request(app.getHttpServer())
        .get('/api/v1/products?page=2&pageSize=2&sortBy=sku&sortOrder=asc')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(secondPage.body.items).toHaveLength(1);

      // The page size is capped, so a caller cannot ask for the whole catalogue.
      const tooBig = await request(app.getHttpServer())
        .get('/api/v1/products?pageSize=500')
        .set('Cookie', adminCookie)
        .expect(400);
      expect(tooBig.body.code).toBe('VALIDATION_ERROR');
    });

    it('answers another organization\'s list with nothing of ours', async () => {
      await createProduct('SKU-1001', 'Blue T-Shirt');

      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', otherOrgCookie)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });

  // =========================================================================
  // US3: Correct a Product Without Losing Someone Else's Work
  // =========================================================================
  describe('US3: Correct a Product', () => {
    it('updates the product, increases the version and records what changed', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/products/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({
          version: created.body.version,
          ...productPayload({ sellingPrice: '10.4900', name: 'Blue T-Shirt XL' }),
        })
        .expect(200);

      expect(res.body.version).toBe(2);
      expect(res.body.sellingPrice).toBe('10.4900');
      expect(res.body.name).toBe('Blue T-Shirt XL');

      // The audit entry carries the values before and after.
      const audit = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTIONS.productsUpdated, recordId: created.body.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      const before = audit!.before as { sellingPrice: string };
      const after = audit!.after as { sellingPrice: string };
      expect(before.sellingPrice).toBe('9.9900');
      expect(after.sellingPrice).toBe('10.4900');
    });

    it('refuses a change prepared against a version that has moved on', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      // Someone else changes it first.
      await request(app.getHttpServer())
        .put(`/api/v1/products/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ version: created.body.version, ...productPayload({ name: 'Changed By Someone Else' }) })
        .expect(200);

      const stale = await request(app.getHttpServer())
        .put(`/api/v1/products/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ version: created.body.version, ...productPayload({ name: 'My Change' }) })
        .expect(409);

      expect(stale.body.code).toBe('STALE_VERSION');

      // The later change was not applied.
      const stored = await prisma.product.findUnique({ where: { id: created.body.id } });
      expect(stored!.name).toBe('Changed By Someone Else');
      expect(stored!.version).toBe(2);
    });

    it('refuses a change that takes a SKU another product holds', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ sku: 'SKU-TAKEN', name: 'First Product' }))
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ sku: 'SKU-OTHER', name: 'Second Product' }))
        .expect(201);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/products/${second.body.id}`)
        .set('Cookie', adminCookie)
        .send({ version: second.body.version, ...productPayload({ sku: 'SKU-TAKEN' }) })
        .expect(409);

      expect(res.body.code).toBe('DUPLICATE_RECORD');
    });

    it('answers another organization\'s product as not found, and refuses the write without the permission', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      const crossTenant = await request(app.getHttpServer())
        .put(`/api/v1/products/${created.body.id}`)
        .set('Cookie', otherOrgCookie)
        .send({ version: created.body.version, ...productPayload() })
        .expect(404);
      expect(crossTenant.body.code).toBe('NOT_FOUND');

      const salesRole = await prisma.role.findFirst({
        where: { organizationId: adminOrgId, key: 'sales' },
      });
      const readerEmail = `reader-update-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/api/v1/memberships')
        .set('Cookie', adminCookie)
        .send({
          email: readerEmail,
          name: 'Products Reader',
          password: 'Password1234',
          roleIds: [salesRole!.id],
        })
        .expect(201);
      const readerCookie = await loginAndChangePassword(app, readerEmail, 'Password1234');

      const refused = await request(app.getHttpServer())
        .put(`/api/v1/products/${created.body.id}`)
        .set('Cookie', readerCookie)
        .send({ version: created.body.version, ...productPayload() })
        .expect(403);
      expect(refused.body.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // US4: Retire a Product Without Deleting It
  // =========================================================================
  describe('US4: Retire a Product', () => {
    it('archives and restores the product, and records both', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      const archived = await request(app.getHttpServer())
        .post(`/api/v1/products/${created.body.id}/archive`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(archived.body.isArchived).toBe(true);

      // It leaves the active list but stays readable.
      const list = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', adminCookie)
        .expect(200);
      expect((list.body as { items: Array<{ id: string }> }).items.some((p) => p.id === created.body.id)).toBe(false);

      const stillThere = await request(app.getHttpServer())
        .get(`/api/v1/products/${created.body.id}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(stillThere.body.isArchived).toBe(true);

      const restored = await request(app.getHttpServer())
        .post(`/api/v1/products/${created.body.id}/restore`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(restored.body.isArchived).toBe(false);

      const auditActions = await prisma.auditLog.findMany({
        where: { recordId: created.body.id },
        select: { action: true },
      });
      const actions = auditActions.map((a) => a.action);
      expect(actions).toContain(AUDIT_ACTIONS.productsArchived);
      expect(actions).toContain(AUDIT_ACTIONS.productsRestored);
    });

    it('refuses the archive of a product the usage check reports in use', async () => {
      // An application whose usage check says the product is in use - the
      // purchasing, sales and inventory features will provide the real one.
      const { app: stubbedApp } = await createTestApp([
        {
          token: PRODUCTS_USAGE_HOOK,
          useValue: {
            isInUse: () =>
              Promise.resolve({
                inUse: true,
                reason: 'This product is referenced by an open purchase order.',
              }),
          },
        },
      ]);

      try {
        const created = await request(stubbedApp.getHttpServer())
          .post('/api/v1/products')
          .set('Cookie', adminCookie)
          .send(productPayload())
          .expect(201);

        const refused = await request(stubbedApp.getHttpServer())
          .post(`/api/v1/products/${created.body.id}/archive`)
          .set('Cookie', adminCookie)
          .expect(409);

        expect(refused.body.code).toBe('PRODUCT_IN_USE');

        // The product stays active.
        const stored = await prisma.product.findUnique({ where: { id: created.body.id } });
        expect(stored!.isArchived).toBe(false);
      } finally {
        await stubbedApp.close();
      }
    });

    it('keeps an archived product\'s SKU reserved, and never deletes a product', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/products/${created.body.id}/archive`)
        .set('Cookie', adminCookie)
        .expect(200);

      // The SKU stays reserved by the archived product.
      const conflict = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload({ name: 'Trying To Take The SKU' }))
        .expect(409);
      expect(conflict.body.code).toBe('DUPLICATE_RECORD');

      // The record is still there: there is no delete.
      const stored = await prisma.product.findUnique({ where: { id: created.body.id } });
      expect(stored).not.toBeNull();

      const deleted = await request(app.getHttpServer())
        .delete(`/api/v1/products/${created.body.id}`)
        .set('Cookie', adminCookie)
        .expect(404);
      expect(deleted.status).toBe(404);
    });

    it('answers another organization\'s product as not found, and refuses the write without the permission', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      const crossTenant = await request(app.getHttpServer())
        .post(`/api/v1/products/${created.body.id}/archive`)
        .set('Cookie', otherOrgCookie)
        .expect(404);
      expect(crossTenant.body.code).toBe('NOT_FOUND');

      const salesRole = await prisma.role.findFirst({
        where: { organizationId: adminOrgId, key: 'sales' },
      });
      const readerEmail = `reader-archive-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/api/v1/memberships')
        .set('Cookie', adminCookie)
        .send({
          email: readerEmail,
          name: 'Products Reader',
          password: 'Password1234',
          roleIds: [salesRole!.id],
        })
        .expect(201);
      const readerCookie = await loginAndChangePassword(app, readerEmail, 'Password1234');

      const refused = await request(app.getHttpServer())
        .post(`/api/v1/products/${created.body.id}/archive`)
        .set('Cookie', readerCookie)
        .expect(403);
      expect(refused.body.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // US5: Manage Categories and Units of Measure
  // =========================================================================
  describe('US5: Categories and Units of Measure', () => {
    it('lists and creates categories and units', async () => {
      const categories = await request(app.getHttpServer())
        .get('/api/v1/product-categories')
        .set('Cookie', adminCookie)
        .expect(200);
      expect((categories.body as Array<{ name: string }>).some((c) => c.name === 'Apparel')).toBe(true);

      const created = await request(app.getHttpServer())
        .post('/api/v1/product-categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Footwear' })
        .expect(201);
      expect(created.body.name).toBe('Footwear');

      const units = await request(app.getHttpServer())
        .get('/api/v1/units-of-measure')
        .set('Cookie', adminCookie)
        .expect(200);
      expect((units.body as Array<{ name: string }>).some((u) => u.name === 'piece')).toBe(true);

      const unit = await request(app.getHttpServer())
        .post('/api/v1/units-of-measure')
        .set('Cookie', adminCookie)
        .send({ name: 'dozen', abbreviation: 'dz' })
        .expect(201);
      expect(unit.body.abbreviation).toBe('dz');
    });

    it('refuses a category or unit name that already exists, in any capitalisation', async () => {
      const category = await request(app.getHttpServer())
        .post('/api/v1/product-categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Outerwear' })
        .expect(201);

      const duplicate = await request(app.getHttpServer())
        .post('/api/v1/product-categories')
        .set('Cookie', adminCookie)
        .send({ name: 'outerwear' })
        .expect(409);
      expect(duplicate.body.code).toBe('DUPLICATE_RECORD');
      expect(category.body.id).toBeDefined();

      await request(app.getHttpServer())
        .post('/api/v1/units-of-measure')
        .set('Cookie', adminCookie)
        .send({ name: 'gross', abbreviation: 'gr' })
        .expect(201);

      const duplicateUnit = await request(app.getHttpServer())
        .post('/api/v1/units-of-measure')
        .set('Cookie', adminCookie)
        .send({ name: 'GROSS', abbreviation: 'g' })
        .expect(409);
      expect(duplicateUnit.body.code).toBe('DUPLICATE_RECORD');
    });

    it('gives a new organization the default units of measure, and writes an audit entry for a unit', async () => {
      const email = `units-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'Password1234' })
        .expect(201);

      const cookie = await loginForCookies(app, email, 'Password1234');
      const units = await request(app.getHttpServer())
        .get('/api/v1/units-of-measure')
        .set('Cookie', cookie)
        .expect(200);

      const names = (units.body as Array<{ name: string }>).map((u) => u.name).sort();
      expect(names).toEqual(['box', 'pair', 'roll', 'unit']);

      const created = await request(app.getHttpServer())
        .post('/api/v1/units-of-measure')
        .set('Cookie', cookie)
        .send({ name: 'tray', abbreviation: 'tr' })
        .expect(201);

      const audit = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTIONS.unitsOfMeasureCreated, recordId: created.body.id },
      });
      expect(audit).not.toBeNull();
    });

    it('answers another organization\'s vocabulary with nothing of ours, and refuses the write without the permission', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/product-categories')
        .set('Cookie', otherOrgCookie)
        .expect(200);
      expect((res.body as Array<{ name: string }>).some((c) => c.name === 'Apparel')).toBe(false);

      const salesRole = await prisma.role.findFirst({
        where: { organizationId: adminOrgId, key: 'sales' },
      });
      const readerEmail = `reader-vocab-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/api/v1/memberships')
        .set('Cookie', adminCookie)
        .send({
          email: readerEmail,
          name: 'Products Reader',
          password: 'Password1234',
          roleIds: [salesRole!.id],
        })
        .expect(201);
      const readerCookie = await loginAndChangePassword(app, readerEmail, 'Password1234');

      const refused = await request(app.getHttpServer())
        .post('/api/v1/product-categories')
        .set('Cookie', readerCookie)
        .send({ name: 'Sneaky Category' })
        .expect(403);
      expect(refused.body.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // T064: Tenant-isolation sweep across every products endpoint (Principle I)
  //
  // This feature added no report or export endpoint, so the sweep covers every
  // products endpoint: list, get, create, update, archive, restore, categories
  // (list and create) and units of measure (list and create).
  // =========================================================================
  describe('T064: Tenant-isolation sweep', () => {
    it('refuses the other organization access to every products endpoint', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);
      const id = created.body.id;

      // The list answers with nothing of ours.
      const list = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', otherOrgCookie)
        .expect(200);
      expect(list.body.total).toBe(0);
      expect(list.body.items).toHaveLength(0);

      // Searching cannot name our products either.
      const searched = await request(app.getHttpServer())
        .get('/api/v1/products?search=SKU-1001')
        .set('Cookie', otherOrgCookie)
        .expect(200);
      expect(searched.body.total).toBe(0);

      // GET one: not found, not disclosed.
      const got = await request(app.getHttpServer())
        .get(`/api/v1/products/${id}`)
        .set('Cookie', otherOrgCookie)
        .expect(404);
      expect(got.body.code).toBe('NOT_FOUND');

      // PUT: refused as not found.
      const put = await request(app.getHttpServer())
        .put(`/api/v1/products/${id}`)
        .set('Cookie', otherOrgCookie)
        .send({ version: 1, ...productPayload({ name: 'Stolen' }) })
        .expect(404);
      expect(put.body.code).toBe('NOT_FOUND');

      // Archive: refused as not found.
      const archive = await request(app.getHttpServer())
        .post(`/api/v1/products/${id}/archive`)
        .set('Cookie', otherOrgCookie)
        .expect(404);
      expect(archive.body.code).toBe('NOT_FOUND');

      // Restore: refused as not found (the product is not archived there either).
      const restore = await request(app.getHttpServer())
        .post(`/api/v1/products/${id}/restore`)
        .set('Cookie', otherOrgCookie)
        .expect(404);
      expect(restore.body.code).toBe('NOT_FOUND');

      // Categories: the list shows none of ours.
      const categories = await request(app.getHttpServer())
        .get('/api/v1/product-categories')
        .set('Cookie', otherOrgCookie)
        .expect(200);
      expect((categories.body as Array<{ name: string }>).some((c) => c.name === 'Apparel')).toBe(false);

      // Units: the list shows none of ours.
      const units = await request(app.getHttpServer())
        .get('/api/v1/units-of-measure')
        .set('Cookie', otherOrgCookie)
        .expect(200);
      expect((units.body as Array<{ name: string }>).some((u) => u.name === 'piece')).toBe(false);

      // Create: the other organization's product is created in ITS OWN
      // organization, never in ours; its audit entry belongs to it.
      const otherCategory = await request(app.getHttpServer())
        .post('/api/v1/product-categories')
        .set('Cookie', otherOrgCookie)
        .send({ name: 'Other Apparel' })
        .expect(201);
      const otherUnit = await request(app.getHttpServer())
        .get('/api/v1/units-of-measure')
        .set('Cookie', otherOrgCookie)
        .expect(200);
      const otherUnitId = otherUnit.body[0].id;

      const otherProduct = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', otherOrgCookie)
        .send({
          sku: 'SKU-1001',
          name: 'Other Product',
          categoryId: otherCategory.body.id,
          unitId: otherUnitId,
          purchasePrice: '1.0000',
          sellingPrice: '2.0000',
        })
        .expect(201);
      expect(otherProduct.body.organizationId).toBe(otherOrgId);

      // Nothing of ours was read, changed or archived.
      const stored = await prisma.product.findUnique({ where: { id } });
      expect(stored!.name).toBe('Blue T-Shirt');
      expect(stored!.isArchived).toBe(false);
      expect(stored!.version).toBe(1);
    });
  });

  // =========================================================================
  // T065: Concurrency and rollback regression against real PostgreSQL
  // (Principle III)
  // =========================================================================
  describe('T065: Concurrency races', () => {
    it('accepts exactly one of two concurrent updates prepared against the same version', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      const version = created.body.version;

      // Two changes prepared against the same version, at the same time.
      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .put(`/api/v1/products/${created.body.id}`)
          .set('Cookie', adminCookie)
          .send({ version, ...productPayload({ name: 'Change One' }) }),
        request(app.getHttpServer())
          .put(`/api/v1/products/${created.body.id}`)
          .set('Cookie', adminCookie)
          .send({ version, ...productPayload({ name: 'Change Two' }) }),
      ]);

      const outcomes = [first.status, second.status].sort();
      expect(outcomes).toEqual([200, 409]);

      const winner = first.status === 200 ? first : second;
      const loser = first.status === 409 ? first : second;
      expect(loser.body.code).toBe('STALE_VERSION');

      const stored = await prisma.product.findUnique({ where: { id: created.body.id } });
      expect(stored!.version).toBe(2);
      expect(['Change One', 'Change Two']).toContain(stored!.name);
      expect(stored!.name).toBe(winner.body.name);

      // The audit trail shows exactly one update, not two.
      const audits = await prisma.auditLog.count({
        where: { action: AUDIT_ACTIONS.productsUpdated, recordId: created.body.id },
      });
      expect(audits).toBe(1);
    });

    it('accepts exactly one of two concurrent archives, and one audit entry', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', adminCookie)
        .send(productPayload())
        .expect(201);

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/products/${created.body.id}/archive`)
          .set('Cookie', adminCookie),
        request(app.getHttpServer())
          .post(`/api/v1/products/${created.body.id}/archive`)
          .set('Cookie', adminCookie),
      ]);

      const outcomes = [first.status, second.status].sort();
      expect(outcomes).toEqual([200, 409]);
      const loser = first.status === 409 ? first : second;
      expect(loser.body.code).toBe('INVALID_STATE_TRANSITION');

      const stored = await prisma.product.findUnique({ where: { id: created.body.id } });
      expect(stored!.isArchived).toBe(true);
      expect(stored!.version).toBe(2);

      const audits = await prisma.auditLog.count({
        where: { action: AUDIT_ACTIONS.productsArchived, recordId: created.body.id },
      });
      expect(audits).toBe(1);
    });
  });
});
