import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';
import { AUDIT_ACTIONS } from '@nexuserp/shared';

describe('Contacts Integration: End-to-End Test Suite', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  // Admin user with contacts.read and contacts.write
  let adminCookie: string;
  let adminOrgId: string;

  // Secondary org for tenant isolation testing
  let otherOrgCookie: string;
  let otherOrgId: string;

  beforeAll(async () => {
    // Seed reference catalog first so permissions exist for the registration flow
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    // 1. Setup primary organization once for suite
    const adminEmail = `admin-contacts-${Date.now()}@example.com`;
    const reg1 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);

    adminOrgId = reg1.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    // 2. Setup secondary organization once for suite
    const otherEmail = `other-contacts-${Date.now()}@example.com`;
    const reg2 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);

    otherOrgId = reg2.body.organization.id;
    otherOrgCookie = await loginForCookies(app, otherEmail, 'Password1234');
  });

  afterAll(async () => {
    if (adminOrgId && otherOrgId) {
      await prisma.contact.deleteMany({
        where: { organizationId: { in: [adminOrgId, otherOrgId] } },
      });
    }
    await app.close();
  });

  beforeEach(async () => {
    await prisma.contact.deleteMany({
      where: { organizationId: { in: [adminOrgId, otherOrgId] } },
    });
  });

  // =========================================================================
  // US1: Create and View Contacts
  // =========================================================================
  describe('US1: Create and View Customers & Suppliers', () => {
    it('creates a customer contact with auto-generated code and audit log', async () => {
      const payload = {
        name: 'Acme Customer Corp',
        email: 'billing@acme.com',
        phone: '+1 555 0100',
        isCustomer: true,
        isSupplier: false,
        addressLine1: '123 Main St',
        city: 'New York',
        country: 'USA',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send(payload)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Acme Customer Corp');
      expect(res.body.email).toBe('billing@acme.com');
      expect(res.body.code).toMatch(/^CUST-\d{5}$/);
      expect(res.body.isCustomer).toBe(true);
      expect(res.body.isSupplier).toBe(false);
      expect(res.body.version).toBe(1);
      expect(res.body.isArchived).toBe(false);

      // Verify persistence in DB
      const dbContact = await prisma.contact.findUnique({
        where: { id: res.body.id },
      });
      expect(dbContact).toBeDefined();
      expect(dbContact?.organizationId).toBe(adminOrgId);

      // Verify audit log entry
      const audit = await prisma.auditLog.findFirst({
        where: {
          organizationId: adminOrgId,
          recordId: res.body.id,
          action: AUDIT_ACTIONS.contactsCreated,
        },
      });
      expect(audit).toBeDefined();
      expect((audit?.after as Record<string, unknown>)?.name).toBe('Acme Customer Corp');
    });

    it('creates a supplier contact with SUPP- prefix code', async () => {
      const payload = {
        name: 'Global Supplier Ltd',
        isCustomer: false,
        isSupplier: true,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send(payload)
        .expect(201);

      expect(res.body.code).toMatch(/^SUPP-\d{5}$/);
      expect(res.body.isSupplier).toBe(true);
      expect(res.body.isCustomer).toBe(false);
    });

    it('rejects contact creation if neither customer nor supplier is true', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({
          name: 'Invalid Contact',
          isCustomer: false,
          isSupplier: false,
        })
        .expect(400);
    });

    it('retrieves an existing contact by ID', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({
          name: 'Inspect Me',
          isCustomer: true,
        })
        .expect(201);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/contacts/${createRes.body.id}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(getRes.body.id).toBe(createRes.body.id);
      expect(getRes.body.name).toBe('Inspect Me');
    });

    it('enforces tenant isolation: reading another organization contact returns 404', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({
          name: 'Secret Org 1 Contact',
          isCustomer: true,
        })
        .expect(201);

      // Attempt to access from Other Org
      await request(app.getHttpServer())
        .get(`/api/v1/contacts/${createRes.body.id}`)
        .set('Cookie', otherOrgCookie)
        .expect(404);
    });
  });

  // =========================================================================
  // US2: List, Search, Filter & Pagination
  // =========================================================================
  describe('US2: Filtered Search and Server-Side Pagination', () => {
    beforeEach(async () => {
      // Create contacts for filtering
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({ name: 'Alpha Customer', email: 'alpha@test.com', phone: '111', isCustomer: true, isSupplier: false });

      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({ name: 'Beta Supplier', email: 'beta@test.com', phone: '222', isCustomer: false, isSupplier: true });

      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({ name: 'Gamma Both', email: 'gamma@test.com', phone: '333', isCustomer: true, isSupplier: true });
    });

    it('filters by role (customer vs supplier)', async () => {
      const customerRes = await request(app.getHttpServer())
        .get('/api/v1/contacts?role=customer')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(customerRes.body.items.length).toBe(2);
      expect(customerRes.body.total).toBe(2);

      const supplierRes = await request(app.getHttpServer())
        .get('/api/v1/contacts?role=supplier')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(supplierRes.body.items.length).toBe(2);
      expect(supplierRes.body.total).toBe(2);
    });

    it('escapes SQL wildcards when searching', async () => {
      // Create contact with literal %
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({ name: '100% Guaranteed', isCustomer: true });

      const searchRes = await request(app.getHttpServer())
        .get('/api/v1/contacts?search=100%')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(searchRes.body.items.length).toBe(1);
      expect(searchRes.body.items[0].name).toBe('100% Guaranteed');
    });

    it('paginates results', async () => {
      const p1 = await request(app.getHttpServer())
        .get('/api/v1/contacts?page=1&pageSize=2')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(p1.body.items.length).toBe(2);
      expect(p1.body.page).toBe(1);
      expect(p1.body.pageSize).toBe(2);
    });
  });

  // =========================================================================
  // US3: Update and Optimistic Concurrency
  // =========================================================================
  describe('US3: Contact Modification and Concurrency Protection', () => {
    it('updates contact successfully and increments version', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({ name: 'Original Name', isCustomer: true })
        .expect(201);

      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/contacts/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({
          version: 1,
          name: 'Updated Name',
          phone: '+1 999 888',
        })
        .expect(200);

      expect(updateRes.body.name).toBe('Updated Name');
      expect(updateRes.body.phone).toBe('+1 999 888');
      expect(updateRes.body.version).toBe(2);

      // Verify audit log for update
      const audit = await prisma.auditLog.findFirst({
        where: {
          organizationId: adminOrgId,
          recordId: created.body.id,
          action: AUDIT_ACTIONS.contactsUpdated,
        },
      });
      expect(audit).toBeDefined();
    });

    it('rejects update with 409 STALE_VERSION when passing stale version', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({ name: 'Version Test', isCustomer: true })
        .expect(201);

      // Advance version to 2
      await request(app.getHttpServer())
        .put(`/api/v1/contacts/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ version: 1, name: 'First Update' })
        .expect(200);

      // Attempt second update with stale version 1
      const staleRes = await request(app.getHttpServer())
        .put(`/api/v1/contacts/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ version: 1, name: 'Stale Overwrite' })
        .expect(409);

      expect(staleRes.body.code).toBe('STALE_VERSION');
    });

    it('rejects duplicate email case-insensitively within the same organization', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({ name: 'First Partner', email: 'partner@example.com', isCustomer: true })
        .expect(201);

      // Try creating duplicate with different case
      const dupCreate = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({ name: 'Second Partner', email: 'PARTNER@EXAMPLE.COM', isCustomer: true })
        .expect(409);

      expect(dupCreate.body.code).toBe('DUPLICATE_RECORD');

      // However, creating same email in OTHER organization succeeds
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', otherOrgCookie)
        .send({ name: 'Other Org Partner', email: 'partner@example.com', isCustomer: true })
        .expect(201);
    });
  });

  // =========================================================================
  // US4: Archive, Restore, and Safe Deletion
  // =========================================================================
  describe('US4: Archive and Restore', () => {
    it('archives and restores a contact', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', adminCookie)
        .send({ name: 'Archive Test', isCustomer: true })
        .expect(201);

      // Archive
      const archiveRes = await request(app.getHttpServer())
        .post(`/api/v1/contacts/${created.body.id}/archive`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(archiveRes.body.isArchived).toBe(true);

      // Verify contact is marked archived in DB
      const dbArchived = await prisma.contact.findUnique({ where: { id: created.body.id } });
      expect(dbArchived?.isArchived).toBe(true);

      // Restore
      const restoreRes = await request(app.getHttpServer())
        .post(`/api/v1/contacts/${created.body.id}/restore`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(restoreRes.body.isArchived).toBe(false);

      const dbRestored = await prisma.contact.findUnique({ where: { id: created.body.id } });
      expect(dbRestored?.isArchived).toBe(false);
    });
  });
});
