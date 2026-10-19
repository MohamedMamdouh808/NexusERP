import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from '../../src/common/errors/all-exceptions.filter';
import { Public, RequirePermission } from '../../src/common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../src/common/guards/permission.guard';

/**
 * Probe controllers for the default-deny test (T106).
 *
 * They live in their own file rather than inline in the spec because NestJS resolves a
 * controller's metatype through the decorator metadata TypeScript emits for the class.
 * A controller declared inside a spec is fragile under a transpile-only transform;
 * declaring it as a normal module is what a real controller looks like.
 */

/** Declares NOTHING: no @Public(), no @RequirePermission(). Must be denied. */
@Controller('undeclared')
export class UndeclaredController {
  @Get()
  undeclared(): { ok: true } {
    return { ok: true };
  }
}

/** Explicitly opts out of authorization. Must be allowed. */
@Controller('declared-public')
export class DeclaredPublicController {
  @Public()
  @Get()
  open(): { ok: true } {
    return { ok: true };
  }
}

/** Declares a real catalog permission the caller does not hold. Must be denied. */
@Controller('declared-permission')
export class DeclaredPermissionController {
  @RequirePermission('products.read')
  @Get()
  guarded(): { ok: true } {
    return { ok: true };
  }
}

/** Declares a permission that does not exist in the catalog. Must be denied. */
@Controller('bad-permission')
export class BadPermissionController {
  @RequirePermission('notareal.permission')
  @Get()
  guarded(): { ok: true } {
    return { ok: true };
  }
}

/**
 * A module carrying the probe controllers, the REAL permission guard, and the REAL
 * exception filter.
 *
 * Both are registered exactly as AppModule registers them. Registering only the guard
 * would be a weaker test: Nest's default exception handler returns its own body shape, so
 * the denial would carry no `code` and the envelope guarantee (FR-021) would go unproven on
 * precisely the route that matters most.
 */
@Module({
  controllers: [
    UndeclaredController,
    DeclaredPublicController,
    DeclaredPermissionController,
    BadPermissionController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class ProbeModule {}
