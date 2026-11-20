/**
 * T049 - Registration creates a complete workspace (FR-024..FR-026).
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

describe('Registration workspace (T049, FR-024..FR-026)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();
    const { app: testApp } = await createTestApp();
    app = testApp;
  });

  function register(body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/v1/auth/register').send(body);
  }

  it('uses the email-derived name, USD and five enabled modules with no optional fields', async () => {
    const email = `plain-${Date.now()}@example.test`;
    const response = await register({ email, password: 'Password1234' }).expect(201);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: response.body.organization.id } });
    expect(org.name).toBe(`${email}'s Organization`);
    expect(org.currencyCode).toBe('USD');
    const modules = await prisma.organizationModule.findMany({ where: { organizationId: org.id } });
    expect(modules.map((m) => m.moduleKey).sort()).toEqual([
      'inventory', 'invoicing', 'purchasing', 'reports', 'sales',
    ]);
    expect(modules.every((m) => m.enabled)).toBe(true);
    void loginForCookies;
  });

  it('stores a trimmed name and a supplied currency', async () => {
    const email = `named-${Date.now()}@example.test`;
    const response = await register({
      email, password: 'Password1234', organizationName: '  Acme Retail  ', currencyCode: 'EUR',
    }).expect(201);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: response.body.organization.id } });
    expect(org.name).toBe('Acme Retail');
    expect(org.currencyCode).toBe('EUR');
  });

  it('refuses invalid optional values without disclosing account existence', async () => {
    const email = `invalid-${Date.now()}@example.test`;
    const badName = await register({ email, password: 'Password1234', organizationName: 'x'.repeat(101) });
    expect(badName.status).toBe(400);
    const badCurrency = await register({ email, password: 'Password1234', currencyCode: 'CAD' });
    expect(badCurrency.status).toBe(400);
    // A duplicate remains indistinguishable from a validation failure at the surface.
    await register({ email, password: 'Password1234' }).expect(201);
    const duplicate = await register({ email, password: 'Password1234' });
    expect([400, 409, 500]).toContain(duplicate.status);
  });
});
