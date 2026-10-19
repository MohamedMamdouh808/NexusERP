import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSION_KEY,
} from '../decorators/require-permission.decorator';

/**
 * Default-deny authorization (Constitution Principle II).
 *
 * The rule this guard enforces is one line: **a route is denied unless it declares
 * otherwise.** A route is reachable only when it carries `@Public()`; everything else
 * requires `@RequirePermission(...)` and a caller that holds it.
 *
 * Why default deny rather than default allow: the primary users are non-technical staff
 * on shared machines, and a single bypassed check exposes another organization's
 * commercial data. Default deny means an unforgotten guard fails CLOSED. A developer who
 * forgets the decorator gets a 403 on their own endpoint - a five-second fix - rather than
 * an unprotected route that ships.
 *
 * The specification requires an endpoint without a declared permission to fail the test
 * suite. That test (T106) exists; until authentication lands there is no caller whose
 * permissions can be resolved, so every non-public route is denied, which is the correct
 * behaviour for an endpoint that exists before the permission system does.
 *
 * NOTE on the 403/404 distinction, which is a tenant-isolation guarantee rather than an
 * authorization one: a request for a record owned by ANOTHER organization returns 404, not
 * 403. 403 would confirm the record exists, leaking the existence of another
 * organization's data. A 403 from THIS guard means "you are a valid member of this
 * organization and you lack a permission" - nothing more.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const required = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      // Denied, and recorded: an undeclared route is a defect, and a silent 403 would
      // send a developer looking at the wrong place.
      this.logger.error(
        `Route ${context.getClass().name}.${context.getHandler().name} declares no permission ` +
          'and is not marked public. Denied by default. Add @RequirePermission(...) or @Public().',
      );
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    // Permission resolution arrives with authentication. Until then the effective set is
    // empty, so a declared route is denied - still failing closed, and now for the
    // correct reason: no session means no permissions.
    const effective = this.effectivePermissions(context);
    if (!effective.includes(required)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return true;
  }

  /**
   * The caller's effective permissions.
   *
   * Empty until authentication ships. It reads the union of the member's role grants
   * from the session context once that exists; today it exists as a single seam so the
   * guard's control flow is final and only its data source is pending.
   */
  private effectivePermissions(context: ExecutionContext): readonly string[] {
    void context;
    return [];
  }
}