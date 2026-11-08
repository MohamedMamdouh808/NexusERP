import { createTestApp } from '../fixtures/app';
import { getTestPrisma } from '../fixtures/database';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

/**
 * Authentication API against a REAL PostgreSQL `*_test` database.
 *
 * Runs ONLY under `npm run test:integration`, which refuses to start unless
 * DATABASE_URL points at localhost or a `*_test` database. Every row the suite
 * creates is tracked and deleted at the end, and a table-count snapshot taken
 * before the tests is compared to one taken after — so a full run provably
 * leaves the database exactly as it found it.
 */

const ALL_PUBLIC_TABLES =
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'";

interface RowCounts {
  [table: string]: number;
}

describe('Authentication API (integration)', () => {
  let app: INestApplication;
  let closeApp: () => Promise<void>;

  // Rows this suite created. Deleting them (with the FK cascades in the schema)
  // restores the pre-test state; the snapshot comparison proves nothing leaked.
  const createdUserIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  async function snapshotRowCounts(): Promise<RowCounts> {
    const prisma = getTestPrisma();
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(ALL_PUBLIC_TABLES);
    const counts: RowCounts = {};
    for (const { table_name } of tables) {
      const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM "${table_name}"`,
      );
      counts[table_name] = Number(rows[0]?.n ?? 0);
    }
    return counts;
  }

  let countsBefore: RowCounts;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    closeApp = testApp.close;
    countsBefore = await snapshotRowCounts();
  });

  afterAll(async () => {
    const prisma = getTestPrisma();

    // Track-authenticated calls depend on these ids being deletable last; the
    // schema cascades memberships/sessions/warehouses/sequences with them.
    for (const id of createdUserIds) {
      try {
        await prisma.user.delete({ where: { id } });
      } catch {
        // Already gone (e.g. cascade) — the snapshot comparison below catches
        // discrepancies; deleting a missing row should not mask it.
      }
    }
    for (const id of createdOrganizationIds) {
      try {
        await prisma.organization.delete({ where: { id } });
      } catch {
        // See above: the row-count comparison is the actual guarantee.
      }
    }

    const countsAfter = await snapshotRowCounts();
    const leaks = Object.keys(countsAfter)
      .filter((table) => countsAfter[table] !== countsBefore[table])
      .map((table) => `${table}: ${countsBefore[table]} -> ${countsAfter[table]}`);
    expect(leaks).toEqual([]);

    await closeApp();
    const { disconnectTestPrisma } = await import('../fixtures/database');
    await disconnectTestPrisma();
  });

  describe('POST /api/v1/auth/register', () => {
    it('creates user, organization, membership, warehouse and session in one call', async () => {
      const email = `register-success-${Date.now()}@tests.nexuserp.local`;
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'TestPassword123' });

      expect(response.status).toBe(201);
      const body = response.body;
      expect(body.user).toMatchObject({ id: expect.any(String), email });
      expect(body.organization).toMatchObject({ id: expect.any(String), name: `${email}'s Organization` });
      expect(body.membership).toMatchObject({ id: expect.any(String), roleKey: 'administrator' });
      expect(body.session).toMatchObject({ id: expect.any(String) });
      // The raw session token only ever crosses the wire at issue time; the
      // database stores only its SHA-256 hash.
      expect(body.sessionToken).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
      expect(body.csrfToken).toEqual(expect.stringMatching(/^[a-f0-9]{32}$/));

      createdUserIds.push(body.user.id);
      createdOrganizationIds.push(body.organization.id);
    });

    it('rejects a missing email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ password: 'TestPassword123' });

      expect(response.status).toBe(400);
    });

    it('rejects a short password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `short-${Date.now()}@tests.nexuserp.local`, password: 'short' });

      expect(response.status).toBe(400);
    });

    it('rejects an invalid email format', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'TestPassword123' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let email: string;
    const password = 'LoginPassword123';

    beforeAll(async () => {
      email = `login-success-${Date.now()}@tests.nexuserp.local`;
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password });
      if (response.status === 201) {
        createdUserIds.push(response.body.user.id);
        createdOrganizationIds.push(response.body.organization.id);
      }
    });

    it('logs in and issues the session + CSRF cookies', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password });

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({ email });
      expect(response.body.membership).toMatchObject({ roleKey: 'administrator' });

      const cookies = (response.headers['set-cookie'] ?? []) as unknown[];
      const cookieText = cookies.map((c) => String(c)).join(';');
      expect(cookieText).toContain('session_id=');
      expect(cookieText).toContain('HttpOnly');
      expect(cookieText).toContain('csrf_token=');
    });

    it('gives the same generic error for a wrong password as for an unknown email', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword123' });
      const unknownEmail = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `nobody-${Date.now()}@tests.nexuserp.local`, password: 'AnyPassword123' });

      // FR-010: both failures must be indistinguishable. The exception filter
      // normalizes the service's NotFoundException to its generic message, which is
      // what callers actually see.
      expect(unknownEmail.status).toBe(wrongPassword.status);
      expect(unknownEmail.body.message ?? '').toContain('Record not found');
      expect(wrongPassword.body.message ?? '').toContain('Record not found');
    });
  });

  describe('protected routes without a session cookie', () => {
    it('GET /api/v1/auth/me is 401', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
    });

    it('GET /api/v1/auth/organizations is 401', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/organizations');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/switch-organization', () => {
    it('returns a session-scoped organization list to pick a membership from', async () => {
      const email = `org-list-${Date.now()}@tests.nexuserp.local`;
      const created = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'TestPassword123' });
      if (created.status === 201) {
        createdUserIds.push(created.body.user.id);
        createdOrganizationIds.push(created.body.organization.id);
      }

      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'TestPassword123' });
      const rawCookie = login.headers['set-cookie'] as unknown as string[];
      const sessionCookie = (rawCookie ?? []).find((c) => String(c).startsWith('session_id=')) ?? '';

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/organizations')
        .set('Cookie', sessionCookie.split(';')[0] ? sessionCookie : '');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0]).toMatchObject({ roleKey: 'administrator' });
    });
  });
});
