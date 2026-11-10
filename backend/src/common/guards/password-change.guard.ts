import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';

/**
 * Forced password-change gate (FR-027, FR-028).
 *
 * While a user's `mustChangePassword` flag is set, only three authenticated
 * capabilities are allowed: changing their own password, reading their own
 * identity, and signing out. Every other authenticated request is refused with
 * 403 `PASSWORD_CHANGE_REQUIRED`.
 *
 * The gate runs after SessionGuard (which sets request.userId) and before
 * PermissionGuard (which resolves effective permissions). A pending-change
 * user must not pass permission checks even on held permissions.
 *
 * Allowed routes (method + path, relative to /api/v1 global prefix):
 *   POST /auth/change-password
 *   GET /auth/me
 *   POST /auth/logout
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      userId?: string;
      url?: string;
      method?: string;
    }>();
    const userId = request.userId;
    if (!userId) {
      // No session: not this guard's concern (PermissionGuard handles 401).
      return true;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mustChangePassword: true },
    });

    if (!user || !user.mustChangePassword) {
      return true;
    }

    // Strip the /api/v1 global prefix to compare route patterns.
    const path = (request.url ?? '').replace(/^\/api\/v1/, '');
    const method = (request.method ?? '').toUpperCase();

    const isAllowed =
      (method === 'POST' && path === '/auth/change-password') ||
      (method === 'GET' && path === '/auth/me') ||
      (method === 'POST' && path === '/auth/logout');

    if (!isAllowed) {
      throw new AppException(
        ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
        [],
        'You must change your password before continuing.',
      );
    }

    return true;
  }
}
