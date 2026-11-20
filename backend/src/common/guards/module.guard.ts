import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';
import { ModuleStateService } from '../../modules/organizations/module-state.service';
import { requireOrganizationId } from '../../common/logging/request-context';
import { REQUIRE_MODULE_KEY } from './require-module.decorator';

/**
 * The single shared module gate (FR-020).
 *
 * Reads module state once per request (cached on the request context) and
 * refuses every endpoint of a disabled switchable module - reads included -
 * with 403 `MODULE_DISABLED`. Endpoints of other modules are unaffected.
 *
 * Default deny: a route that reaches the guard without `@RequireModule()` is
 * refused and the defect is logged, so a forgotten decorator fails closed
 * instead of open.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  private readonly logger = new Logger(ModuleGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly moduleState: ModuleStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declared = this.reflector.getAllAndOverride<string>(REQUIRE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!declared) {
      this.logger.error(
        `Route ${context.getClass().name}.${context.getHandler().name} declares no module gate. ` +
          'Denied by default. Add @RequireModule("...") to the endpoint.',
      );
      throw new AppException(
        ERROR_CODES.FORBIDDEN,
        [],
        'You do not have permission to perform this action.',
      );
    }

    const organizationId = requireOrganizationId();
    const enabled = await this.moduleState.isEnabled(organizationId, declared);

    if (!enabled) {
      throw new AppException(
        ERROR_CODES.MODULE_DISABLED,
        [
          {
            field: 'module',
            code: ERROR_CODES.MODULE_DISABLED,
            message: 'This module is not enabled for your organization.',
          },
        ],
        'This module is not enabled for your organization.',
      );
    }

    return true;
  }
}
