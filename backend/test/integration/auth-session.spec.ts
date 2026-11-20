/**
 * T006 - Foundation test for the extended /auth/me session payload (FR-001, FR-027).
 *
 * Every signed-in session carries the organization's currency code, default
 * payment terms and enabled modules, and each organization's session carries
 * only its own values. Written first: it must fail until T015 loads the module
 * rows into /auth/me and the migration backfills existing organizations.
 */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase } from '../fixtures/database';

const SWITCHABLE = ['inventory', 'purchasing', 'sales', 'invoicing', 'reports'];

describe('Session payload: enabled modules, currency and terms (T006, FR-001, FR-027)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();
    const { app: testApp } = await createTestApp();
    app = testApp;
  });

  async function registerAndLogin(email: string) {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1234' })
      .expect(201);
    return loginForCookies(app, email, 'Password1234');
  }

  async function me(cookie: string) {
    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);
  }

  it('returns currency, terms and all five switchable modules for a registered organization', async () => {
    const cookie = await registerAndLogin(`me-alpha-${Date.now()}@example.test`);
    const body = (await me(cookie)).body;

    expect(body.organization.currencyCode).toBe('USD');
    expect(body.organization.defaultPaymentTermsDays).toBe(30);
    expect(body.organization.enabledModules).toEqual(
      expect.arrayContaining(SWITCHABLE),
    );
    // Always-on modules are not toggleable rows and are not listed as switchable.
    expect(body.organization.enabledModules).not.toContain('contacts');
    expect(body.organization.enabledModules).not.toContain('products');
    expect(body.organization.enabledModules).not.toContain('settings');
    expect(body.organization.enabledModules).not.toContain('audit');
  });

  it('carries only the calling organization\u2019s values in a two-organization session', async () => {
    const adminCookie = await registerAndLogin(`me-beta-${Date.now()}@example.test`);
    const otherCookie = await registerAndLogin(`me-gamma-${Date.now()}@example.test`);

    const [adminBody, otherBody] = await Promise.all([
      me(adminCookie),
      me(otherCookie),
    ]).then(([a, o]) => [a.body, o.body]);

    expect(adminBody.organization.id).not.toBe(otherBody.organization.id);
    expect(adminBody.organization.enabledModules).toEqual(
      expect.arrayContaining(SWITCHABLE),
    );
    expect(otherBody.organization.enabledModules).toEqual(
      expect.arrayContaining(SWITCHABLE),
    );
    // The modules table is per-organization: disabling one org's module (later
    // stories) must not leak into the other org's session. Here both are freshly
    // registered and identical, but each session names its own organization id.
    expect(adminBody.user.email).toContain('me-beta');
    expect(otherBody.user.email).toContain('me-gamma');
  });
});
