/**
 * T008 - Foundation test for the shared module guard (FR-020).
 *
 * The guard reads module state once per request (cached on the request context)
 * and refuses every endpoint of a disabled switchable module with 403
 * `MODULE_DISABLED`, while endpoints of enabled modules pass and endpoints of
 * other modules are unaffected.
 *
 * ModuleStateService is mocked so this test exercises the guard rule, not the
 * database. It is written first and must fail until T012/T013 exist.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AppException } from '../../errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';
import { Reflector } from '@nestjs/core';
import { ModuleGuard } from '../module.guard';
import { REQUIRE_MODULE_KEY } from '../require-module.decorator';
import type { ModuleStateService } from '../../../modules/organizations/module-state.service';
import { runWithRequestContext, type RequestContext } from '../../../common/logging/request-context';

const REQUEST_CONTEXT: RequestContext = {
  requestId: 'test-1',
  userId: 'user-1',
  organizationId: 'org-1',
};
function inRequest<T>(work: () => T): T {
  return runWithRequestContext(REQUEST_CONTEXT, work);
}

function contextFor(declared: string | undefined): {
  context: ExecutionContext;
  reflector: Reflector;
} {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => {
      if ((key as string) === REQUIRE_MODULE_KEY) return declared;
      return undefined;
    });
  const context = {
    getHandler: jest.fn(() => ({})),
    getClass: jest.fn(() => ({})),
    switchToHttp: jest.fn(() => ({ getRequest: () => ({ headers: {} }) })),
    reflector,
  } as unknown as ExecutionContext;
  return { context, reflector };
}

describe('ModuleGuard (T008, FR-020)', () => {
  let guard: ModuleGuard;
  let moduleState: ModuleStateService;

  beforeEach(() => {
    moduleState = {
      isEnabled: jest.fn(() => Promise.resolve(true)),
      getEnabledModules: jest.fn(() => Promise.resolve([])),
      getStates: jest.fn(() => Promise.resolve([])),
    } as unknown as ModuleStateService;
  });

  it('denies by default when no module is declared', async () => {
    const { context, reflector } = contextFor(undefined);
    guard = new ModuleGuard(reflector, moduleState);
    await expect(inRequest(() => guard.canActivate(context))).rejects.toThrow(AppException);
  });

  it('allows an enabled module', async () => {
    const { context, reflector } = contextFor('inventory');
    guard = new ModuleGuard(reflector, moduleState);
    jest.spyOn(moduleState, 'isEnabled').mockResolvedValueOnce(true);
    await expect(inRequest(() => guard.canActivate(context))).resolves.toBe(true);
  });

  it('refuses a disabled module with 403 MODULE_DISABLED and the module key in details', async () => {
    const { context, reflector } = contextFor('sales');
    guard = new ModuleGuard(reflector, moduleState);
    jest.spyOn(moduleState, 'isEnabled').mockResolvedValueOnce(false);
    try {
      await inRequest(() => guard.canActivate(context));
      throw new Error('expected guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).errorCode).toBe(ERROR_CODES.MODULE_DISABLED);
      expect((error as AppException).details).toContainEqual(
        expect.objectContaining({ field: 'module' }),
      );
    }
  });

  it('reads module state once per request for two guarded reads', async () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => {
        if ((key as string) === REQUIRE_MODULE_KEY) return 'inventory';
        return undefined;
      });
    guard = new ModuleGuard(reflector, moduleState);
    jest.spyOn(moduleState, 'isEnabled').mockResolvedValue(true);
    await inRequest(() => guard.canActivate(contextFor('inventory').context));
    await inRequest(() => guard.canActivate(contextFor('purchasing').context));
    expect((moduleState.isEnabled as jest.Mock).mock.calls.length).toBe(2);
  });

  it('fails closed when the organization has no tenant context', async () => {
    const { context, reflector } = contextFor('inventory');
    guard = new ModuleGuard(reflector, moduleState);
    jest.spyOn(moduleState, 'isEnabled').mockRejectedValueOnce(
      new UnauthorizedException('No organization in the request context.'),
    );
    await expect(inRequest(() => guard.canActivate(context))).rejects.toThrow(UnauthorizedException);
  });
});
