import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../../../common/decorators/require-permission.decorator';
import { extendRequestContext } from '../../../common/logging/request-context';

export interface SessionRequest extends Request {
  userId?: string;
  membershipId?: string;
}

/**
 * Session guard. Validates the session cookie against the database, checks
 * idle/absolute expiry, and verifies membership is active. Sets userId and
 * membershipId on the request object for downstream handlers.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only a genuinely PUBLIC route skips the session. A route marked
    // `@Authenticated()` (session required, no permission required) still has
    // its session validated here - that is the whole point of the distinction.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<SessionRequest>();
    // cookie-parser is registered globally in main.ts; its untyped declaration is
    // narrowed here so the session cookie is read as a string, never as `any`.
    const sessionId = (request.cookies as Record<string, string | undefined> | undefined)?.[
      'session_id'
    ];

    if (!sessionId) {
      throw new UnauthorizedException('No session cookie.');
    }

    const tokenHash = createHash('sha256').update(sessionId).digest('hex');

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { membership: { include: { organization: true } } },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid session.');
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException('Session expired.');
    }

    if (!session.membership || !session.membership.isActive) {
      throw new UnauthorizedException('Membership not active.');
    }

    // Update lastUsedAt to track idle time (best-effort, don't block on it)
    void this.prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    request.userId = session.userId;
    request.membershipId = session.membershipId;

    // Bind the caller's identity and tenant to the request context. Guards run before
    // controllers, so this is the earliest point the context can learn who is calling;
    // without it a controller reading getRequestContext() sees nulls and queries with
    // an empty organization id.
    extendRequestContext({
      userId: session.userId,
      organizationId: session.membership.organizationId,
    });

    return true;
  }
}
