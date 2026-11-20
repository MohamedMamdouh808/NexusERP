import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../platform/prisma/prisma.service';
import {
  IS_AUTHENTICATED_KEY,
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
 * commercial data. Default deny means an unforgotten check fails CLOSED. A developer who
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

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    // A route that needs a session but no particular permission (the caller's own
    // identity: /auth/me, /auth/organizations, /auth/change-password, ...) declares
    // that with @Authenticated(). The session guard has already validated the
    // session; there is simply no permission to demand.
    const isAuthenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      IS_AUTHENTICATED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isAuthenticatedOnly === true) return true;

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

    // Permission resolution arrives with authentication. The session guard resolves
    // the full identity (including permissions) in one round trip per request; no
    // caching beyond the request, so role/permission changes apply from the member's
    // next request onward (FR-004, FR-006).
    const effective = await this.effectivePermissions(context);
    if (!effective.includes(required)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return true;
  }

  /**
   * The caller's effective permissions: the union of all permissions granted through
   * the membership's roles, resolved from the database on every request.
   *
   * Returns an empty set when no session/membership is bound to the request
   * (unauthenticated callers hit default deny).
   */
  private async effectivePermissions(context: ExecutionContext): Promise<readonly string[]> {
    const request = context.switchToHttp().getRequest<{
      membershipId?: string;
      identity?: { permissions?: readonly string[] };
    }>();
    // The session guard resolves the caller's permissions in the same round trip as
    // the session. Reusing them here keeps the count at one query per request
    // (FR-006); a missing identity (unauthenticated) falls through to default deny.
    if (request.identity?.permissions) {
      return request.identity.permissions;
    }

    const membershipId = request.membershipId;
    if (!membershipId) return [];

    // Fallback for callers that bind a membership without going through the
    // session guard (none in production). Kept so the guard never returns a
    // stale empty set when identity loading is unavailable.
    const permissions = await this.prisma.permission.findMany({
      where: {
        rolePermissions: {
          some: {
            role: {
              memberships: {
                some: { membershipId },
              },
            },
          },
        },
      },
      select: { code: true },
    });

    return permissions.map((p) => p.code);
  }
}
