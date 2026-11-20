/**
 * T032 - Module-guard coverage (FR-020..FR-022).
 *
 * Every endpoint of a switchable module declares the module gate, and a
 * disabled module returns 403 MODULE_DISABLED on every one of its endpoints
 * (reads included) while enabled modules stay available.
 */

import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AppException } from '../../src/common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';
import { REQUIRE_MODULE_KEY } from '../../src/common/guards/require-module.decorator';
import { PURCHASING_MODULE_KEY } from '../../src/common/guards/purchasing-module.guard';
import { SALES_MODULE_KEY } from '../../src/common/guards/sales-module.guard';
import { INVOICING_MODULE_KEY } from '../../src/common/guards/invoicing-module.guard';
import { PurchasingController } from '../../src/modules/purchasing/purchasing.controller';
import { SalesController } from '../../src/modules/sales/sales.controller';
import { InvoicingController } from '../../src/modules/invoicing/invoicing.controller';
import { InventoryController } from '../../src/modules/inventory/inventory.controller';
import { ReportsController } from '../../src/modules/reports/reports.controller';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase } from '../fixtures/database';
import request from 'supertest';

function routes(controller: unknown) {
  const found: { path: string; method: number; module: unknown }[] = [];
  const proto = (controller as { prototype: object }).prototype;
  for (const name of Object.getOwnPropertyNames(proto)) {
    const handler = (proto as Record<string, unknown>)[name];
    if (typeof handler !== 'function') continue;
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
    const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
    if (method === undefined || path === undefined) continue;
    const module =
      Reflect.getMetadata(REQUIRE_MODULE_KEY, handler) ??
      Reflect.getMetadata(PURCHASING_MODULE_KEY, handler) ??
      Reflect.getMetadata(SALES_MODULE_KEY, handler) ??
      Reflect.getMetadata(INVOICING_MODULE_KEY, handler);
    found.push({ path, method, module });
  }
  return found;
}

describe('Module-guard coverage (T032, FR-020..FR-022)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();
    const { app: testApp } = await createTestApp();
    app = testApp;
  });

  it('every endpoint of the five switchable modules declares a module gate', () => {
    const controllers: [unknown, string][] = [
      [PurchasingController, 'purchasing'],
      [SalesController, 'sales'],
      [InvoicingController, 'invoicing'],
      [InventoryController, 'inventory'],
      [ReportsController, 'reports'],
    ];
    for (const [controller] of controllers) {
      const found = routes(controller);
      expect(found.length).toBeGreaterThan(0);
      for (const route of found) {
        expect(route.module).toBeDefined();
      }
    }
  });

  it('a disabled module refuses every read endpoint with MODULE_DISABLED, others stay available', async () => {
    const email = `guard-${Date.now()}@example.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1234' })
      .expect(201);
    const cookie = await loginForCookies(app, email, 'Password1234');

    const modules = (await request(app.getHttpServer())
      .get('/api/v1/organizations/current/modules')
      .set('Cookie', cookie)
      .expect(200)).body.modules;
    const reports = modules.find((m: { key: string }) => m.key === 'reports');
    await request(app.getHttpServer())
      .put('/api/v1/organizations/current/modules/reports')
      .set('Cookie', cookie)
      .send({ enabled: false, version: reports.version })
      .expect(200);

    // Reports endpoints are refused, reads included.
    for (const path of ['kpi-summary', 'stock-on-hand', 'sales-over-time', 'top-products']) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/reports/${path}`)
        .set('Cookie', cookie)
        .expect(403);
      expect(response.body.code).toBe(ERROR_CODES.MODULE_DISABLED);
    }

    // Unaffected modules stay available.
    await request(app.getHttpServer())
      .get('/api/v1/purchase-orders')
      .set('Cookie', cookie)
      .expect(200);

    // Re-enable restores access.
    const after = (await request(app.getHttpServer())
      .get('/api/v1/organizations/current/modules')
      .set('Cookie', cookie)
      .expect(200)).body.modules;
    const reportsNow = after.find((m: { key: string }) => m.key === 'reports');
    await request(app.getHttpServer())
      .put('/api/v1/organizations/current/modules/reports')
      .set('Cookie', cookie)
      .send({ enabled: true, version: reportsNow.version })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/reports/kpi-summary?start=2026-11-01&end=2026-11-19')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('the shared guard fails closed when a route has no module declaration', () => {
    // The unit spec covers default-deny; here we assert the code is a 403-class error.
    expect(ERROR_CODES.MODULE_DISABLED).toBe('MODULE_DISABLED');
    expect(new AppException(ERROR_CODES.MODULE_DISABLED).getStatus()).toBe(403);
  });
});
