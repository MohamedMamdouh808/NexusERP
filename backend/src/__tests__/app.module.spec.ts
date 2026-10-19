import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { MiddlewareConsumer } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';

import { AppModule } from '../app.module';
import { AllExceptionsFilter } from '../common/errors/all-exceptions.filter';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequestIdMiddleware } from '../common/logging/request-id.middleware';

/**
 * T057. The ordering in AppModule is not a style preference, it is the mechanism that
 * makes a rejected request traceable.
 *
 * An interceptor runs AFTER guards. If the identifier were assigned there, a request
 * denied by the guard would carry no identifier at all: its 403 could not be correlated
 * with the server log, and FR-028 would be satisfied on the happy path and broken on
 * exactly the requests an operator most needs to investigate.
 *
 * These assertions are structural because the failure mode is structural. A behavioural
 * test cannot distinguish "the middleware ran first" from "the middleware ran and the
 * response happened to include a header"; only the wiring itself says which.
 */
describe('AppModule registration order (T057, FR-028, Constitution Principle II)', () => {
  it('registers the request identifier as middleware, which runs before guards', () => {
    const applied: unknown[] = [];

    const consumer = {
      apply: (...middleware: unknown[]) => ({
        forRoutes: (...routes: unknown[]) => {
          applied.push(...middleware, ...routes);
        },
      }),
    } as unknown as MiddlewareConsumer;

    new AppModule().configure(consumer);

    expect(applied).toContain(RequestIdMiddleware);
  });

  it('registers the permission guard globally so a new endpoint cannot opt out', () => {
    const providers = Reflect.getMetadata('providers', AppModule) as
      | { provide: unknown; useClass?: unknown }[]
      | undefined;

    expect(providers ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: APP_GUARD, useClass: PermissionGuard }),
      ]),
    );
  });

  it('registers the exception filter globally so a new endpoint cannot return another shape', () => {
    const providers = Reflect.getMetadata('providers', AppModule) as
      | { provide: unknown; useClass?: unknown }[]
      | undefined;

    expect(providers ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: APP_FILTER, useClass: AllExceptionsFilter }),
      ]),
    );
  });
});