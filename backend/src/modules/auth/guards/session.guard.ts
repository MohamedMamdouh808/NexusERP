import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../platform/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    return true;
  }
}
