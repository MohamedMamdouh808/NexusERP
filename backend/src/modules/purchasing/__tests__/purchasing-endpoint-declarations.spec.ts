import { describe, expect, it } from '@jest/globals';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_CODES } from '@nexuserp/shared';

import { REQUIRE_MODULE_KEY } from '../../../common/guards/require-module.decorator';
import {
  REQUIRED_PERMISSION_KEY,
} from '../../../common/decorators/require-permission.decorator';
import { SessionGuard } from '../../auth/guards/session.guard';
import { ModuleGuard } from '../../../common/guards/module.guard';
import { PurchasingController } from '../purchasing.controller';

/**
 * Every purchasing endpoint declares its permission and the shared Purchasing
 * module gate.
 *
 * The default-deny spec proves that an endpoint without a declared permission
 * is refused. What it cannot prove is that the REAL purchasing controller
 * declares one for every route, or that every route declares the shared module
 * gate the Organization settings feature will plug into. Both are structural
 * claims, so this test enumerates the controller by reflection and checks the
 * declarations route by route.
 *
 * A route added without `@PurchasingModule()` fails here instead of failing
 * closed (and silently) at runtime - the same construction as the default-deny
 * probe, but against the real controller rather than a fixture.
 */
describe('Purchasing endpoint declarations (T081)', () => {
  type RouteHandler = {
    readonly name: string;
    readonly path: string;
    readonly method: RequestMethod;
    readonly permission: unknown;
    readonly moduleGate: unknown;
  };

  function enumerateRoutes(): readonly RouteHandler[] {
    const routes: RouteHandler[] = [];
    const prototype = PurchasingController.prototype as unknown as Record<string, unknown>;

    for (const name of Object.getOwnPropertyNames(prototype)) {
      const handler = prototype[name];
      if (typeof handler !== 'function') continue;

      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (method === undefined || path === undefined) continue;

      routes.push({
        name,
        path,
        method,
        permission: Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler),
        moduleGate: Reflect.getMetadata(REQUIRE_MODULE_KEY, handler),
      });
    }
    return routes;
  }

  it('enumerates every purchasing route (a silent enumeration bug fails here, not in production)', () => {
    const routes = enumerateRoutes();

    // GET purchase-orders, GET goods-receipts, GET purchase-orders/:id,
    // POST purchase-orders, PUT purchase-orders/:id, POST .../confirm,
    // POST .../cancel, POST .../receipts
    expect(routes.length).toBe(8);
    expect(routes.map((route) => `${RequestMethod[route.method]} /${route.path}`).sort()).toEqual([
      'GET /goods-receipts',
      'GET /purchase-orders',
      'GET /purchase-orders/:id',
      'POST /purchase-orders',
      'POST /purchase-orders/:id/cancel',
      'POST /purchase-orders/:id/confirm',
      'POST /purchase-orders/:id/receipts',
      'PUT /purchase-orders/:id',
    ]);
  });

  it('every purchasing endpoint declares a permission from the shared catalogue', () => {
    for (const route of enumerateRoutes()) {
      expect(typeof route.permission).toBe('string');
      expect((route.permission as string).length).toBeGreaterThan(0);
      expect(PERMISSION_CODES.has(route.permission as string)).toBe(true);
    }
  });

  it('every purchasing endpoint declares the shared Purchasing module gate', () => {
    for (const route of enumerateRoutes()) {
      expect(route.moduleGate).toBe('purchasing');
    }
  });

  it('the controller runs the session guard and the shared Purchasing module guard', () => {
    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, PurchasingController) as unknown[] | undefined) ?? [];

    expect(guards).toContain(SessionGuard);
    expect(guards).toContain(ModuleGuard);
  });

  it('the read routes ask for purchasing.read, the order writes for purchasing.write, and receipts for inventory.receive', () => {
    const byMethodAndPath = new Map(
      enumerateRoutes().map((route) => [`${RequestMethod[route.method]} /${route.path}`, route]),
    );

    expect(byMethodAndPath.get('GET /purchase-orders')?.permission).toBe('purchasing.read');
    expect(byMethodAndPath.get('GET /goods-receipts')?.permission).toBe('purchasing.read');
    expect(byMethodAndPath.get('GET /purchase-orders/:id')?.permission).toBe('purchasing.read');
    expect(byMethodAndPath.get('POST /purchase-orders')?.permission).toBe('purchasing.write');
    expect(byMethodAndPath.get('PUT /purchase-orders/:id')?.permission).toBe('purchasing.write');
    expect(byMethodAndPath.get('POST /purchase-orders/:id/confirm')?.permission).toBe('purchasing.write');
    expect(byMethodAndPath.get('POST /purchase-orders/:id/cancel')?.permission).toBe('purchasing.write');
    expect(byMethodAndPath.get('POST /purchase-orders/:id/receipts')?.permission).toBe('inventory.receive');
  });
});
