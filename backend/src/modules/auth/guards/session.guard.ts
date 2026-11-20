import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { IS_PUBLIC_KEY } from '../../../common/decorators/require-permission.decorator';
import { extendRequestContext } from '../../../common/logging/request-context';
import { RequestIdentityService } from '../request-identity.service';
import type { RequestIdentity } from '../request-identity.service';

export interface SessionRequest extends Request {
  userId?: string;
  membershipId?: string;
  identity?: RequestIdentity;
}

/**
 * Session guard. Validates the session cookie against the database, checks
 * idle/absolute expiry, and verifies membership is active. Sets userId and
 * membershipId on the request object for downstream handlers.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identityService: RequestIdentityService,
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

    const result = await this.identityService.load(tokenHash);

    if (result.kind === 'expired') {
      throw new UnauthorizedException('Session expired.');
    }
    if (result.kind !== 'identity') {
      throw new UnauthorizedException('Invalid session.');
    }

    const identity = result.identity;
    if (!identity.membership.isActive) {
      throw new UnauthorizedException('Membership not active.');
    }

    request.userId = identity.userId;
    request.membershipId = identity.membershipId;
    request.identity = identity;

    // Bind the caller's identity and tenant to the request context. Guards run before
    // controllers, so this is the earliest point the context can learn who is calling;
    // without it a controller reading getRequestContext() sees nulls and queries with
    // an empty organization id.
    extendRequestContext({
      userId: identity.userId,
      organizationId: identity.organizationId,
      moduleStates: identity.moduleStates,
    });

    return true;
  }
}
