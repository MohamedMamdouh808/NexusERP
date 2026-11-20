import { createTestApp } from '../fixtures/app';
import { getTestPrisma } from '../fixtures/database';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

/**
 * Authentication API against a REAL PostgreSQL instance (schema-isolated).
 *
 * Runs ONLY under `npm run test:integration`, which refuses to start unless the
 * DATABASE_URL targets localhost, a `*_test` database, or a non-public isolated schema.
 * Every row this suite creates is tracked and deleted at the end, and a table-count
 * snapshot taken before the tests (in the CURRENT schema, i.e. the isolated test schema
 * — never `public`) is compared to one taken after — so a full run provably leaves the
 * database exactly as it found it.
 *
 * audit_logs is the one documented exception: the log is append-only (FR-017) and an
 * entry survives its actor's deletion (FR: audit trail integrity), so the suite's audit
 * entries cannot be cleaned up and may count higher after the run. login_attempts rows
 * the suite itself causes are deleted by email.
 */

const ALL_CURRENT_SCHEMA_TABLES =
  "SELECT table_name FROM information_schema.tables WHERE table_schema = CURRENT_SCHEMA AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'";

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
  // Emails used for failed sign-ins: login attempts are keyed by email (no FK), so
  // the suite must delete its own rows; nothing cascades them away.
  const attemptedEmails: string[] = [];

  async function snapshotRowCounts(): Promise<RowCounts> {
    const prisma = getTestPrisma();
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(ALL_CURRENT_SCHEMA_TABLES);
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

    // login_attempts has no FK to users (it is keyed by raw email), so it is not
    // cascaded: delete this suite's rows directly.
    await prisma.loginAttempt.deleteMany({ where: { email: { in: attemptedEmails } } });

    // Track-authenticated calls depend on these ids being deletable last; the
    // schema cascades memberships/sessions/warehouses/sequences with them. The
    // audit_logs FKs are ON DELETE SET NULL (the log survives actor deletion),
    // so user/organization deletes themselves are permitted.
    for (const id of createdUserIds) {
      try {
        await prisma.user.delete({ where: { id } });
      } catch {
        // Already gone (e.g. cascade) — the snapshot comparison below catches
        // discrepancies; deleting a missing row should not mask it.
      }
    }
    // Register seeds the default units of measure inside the organization's
    // own transaction, and units_of_measure -> organizations is ON DELETE
    // RESTRICT: without this the organization delete is refused and the
    // pre-test snapshot never balances.
    await prisma.unitOfMeasure.deleteMany({
      where: { organizationId: { in: createdOrganizationIds } },
    });

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
      // audit_logs is append-only (FR-017): entries written during the run are
      // intentionally never removed, so their count may only ever grow.
      .filter((table) => table !== 'audit_logs')
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
      expect(body.membership).toMatchObject({ id: expect.any(String), roles: [{ key: 'administrator' }] });
      expect(body.session).toMatchObject({ id: expect.any(String) });
      // The raw session token only ever crosses the wire at issue time; the
      // database stores only its SHA-256 hash.
      expect(body.sessionToken).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
      // The CSRF token is 32 random bytes, hex-encoded - 64 characters, like
      // the session token.
      expect(body.csrfToken).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));

      createdUserIds.push(body.user.id);
      createdOrganizationIds.push(body.organization.id);
    });

    it('registers with a typed organization name and serves it on /auth/me', async () => {
      const email = `register-org-${Date.now()}@tests.nexuserp.local`;
      const organizationName = 'Acme Logistics 009';

      const register = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'TestPassword123', organizationName });

      expect(register.status).toBe(201);
      expect(register.body.organization).toMatchObject({
        id: expect.any(String),
        name: organizationName,
      });

      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'TestPassword123' });
      expect(login.status).toBe(200);
      const rawCookie = login.headers['set-cookie'] as unknown as string[];
      const sessionCookie = (rawCookie ?? [])
        .map((cookie) => String(cookie))
        .join('; ');

      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie);

      expect(me.status).toBe(200);
      expect(me.body.organization).toMatchObject({ name: organizationName });

      createdUserIds.push(register.body.user.id);
      createdOrganizationIds.push(register.body.organization.id);
    });

    it('rejects a whitespace-only organization name and creates nothing', async () => {
      const email = `register-blank-${Date.now()}@tests.nexuserp.local`;
      const before = await snapshotRowCounts();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'TestPassword123', organizationName: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.details ?? []).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'organizationName' }),
        ]),
      );

      const after = await snapshotRowCounts();
      for (const table of Object.keys(after)) {
        if (table === 'audit_logs') continue;
        expect(after[table]).toBe(before[table]);
      }
    });

    it('keeps the placeholder organization name when organizationName is omitted', async () => {
      const email = `register-placeholder-${Date.now()}@tests.nexuserp.local`;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'TestPassword123' });

      expect(response.status).toBe(201);
      expect(response.body.organization).toMatchObject({ name: `${email}'s Organization` });

      createdUserIds.push(response.body.user.id);
      createdOrganizationIds.push(response.body.organization.id);
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
      expect(response.body.membership).toMatchObject({ roles: [{ key: 'administrator' }] });

      const cookies = (response.headers['set-cookie'] ?? []) as unknown[];
      const cookieText = cookies.map((c) => String(c)).join(';');
      expect(cookieText).toContain('session_id=');
      expect(cookieText).toContain('HttpOnly');
      expect(cookieText).toContain('csrf_token=');
    });

    it('gives the same generic error for a wrong password as for an unknown email', async () => {
      attemptedEmails.push(email);
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword123' });
      const unknownEmailAccount = `nobody-${Date.now()}@tests.nexuserp.local`;
      attemptedEmails.push(unknownEmailAccount);
      const unknownEmail = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: unknownEmailAccount, password: 'AnyPassword123' });

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
      expect(response.body[0]).toMatchObject({ roles: [{ key: 'administrator' }] });
    });
  });
});

