import { Injectable, NestMiddleware } from '@nestjs/common';
import { isValidRequestId, REQUEST_ID_HEADER } from '@nexuserp/shared';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context';

/**
 * Assigns every request exactly one identifier and makes it available for the rest of
 * the request (FR-028 to FR-031).
 *
 * Rules, in order:
 *   1. A client-supplied `x-request-id` that satisfies the allowlist is ADOPTED, so a
 *      caller can correlate its own trace with ours.
 *   2. Otherwise a UUID v4 is GENERATED.
 *   3. A supplied value that is unusable is REPLACED, never rejected.
 *
 * Rule 3 is deliberate and worth stating: a malformed tracing header is a client defect,
 * not a reason to fail a business operation, and refusing it would let an
 * unauthenticated caller provoke a 400 at will. Sanitization rather than rejection is
 * what prevents a supplied value from forging a log line - the allowlist admits only
 * `[A-Za-z0-9._-]`, so no newline or control character can survive.
 *
 * This is registered as MIDDLEWARE rather than as an interceptor on purpose: an
 * interceptor runs after guards, so a request rejected by a guard would have no
 * identifier at all (T057).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.headers[REQUEST_ID_HEADER];

    const candidate =
      typeof supplied === 'string'
        ? supplied
        : Array.isArray(supplied)
          ? supplied[0]
          : undefined;

    const requestId = isValidRequestId(candidate) ? candidate : randomUUID();

    // Echoed on EVERY response, successful or not, so a client always has the handle.
    response.setHeader(REQUEST_ID_HEADER, requestId);

    runWithRequestContext({ requestId, userId: null, organizationId: null }, () => {
      next();
    });
  }
}