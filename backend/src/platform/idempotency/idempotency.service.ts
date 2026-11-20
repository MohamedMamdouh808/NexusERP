import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

import { AppException } from '../../common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';
import { TransactionService, type TransactionClient } from '../transaction/transaction.service';

/**
 * The idempotency layer (PRD 9.6).
 *
 * A posting endpoint must survive a client that retries: a dropped connection
 * must not post twice, and a client that reuses a key for a DIFFERENT request
 * must be told rather than silently accepted. The layer therefore records, per
 * (organization, endpoint, key), the fingerprint of the request and the response
 * that was given the first time.
 *
 * The claim is written INSIDE the business transaction, so a rolled-back attempt
 * stores nothing and the key stays free for a corrected request. The unique
 * index is what serializes two simultaneous requests with the same key: the
 * second one's INSERT waits for the first to commit and then fails with a
 * unique violation, which is the signal to replay the stored response.
 *
 * Records expire after 24 hours; an expired record is treated as absent and is
 * purged by scripts/purge-expired-idempotency-keys.mjs.
 */

/** How long a claim is remembered. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyRequest {
  readonly organizationId: string;
  readonly endpoint: string;
  readonly key: string;
  /** The request body as the client sent it; its fingerprint is derived from it. */
  readonly body: unknown;
}

export interface IdempotentOutcome<T> {
  readonly status: number;
  readonly body: T;
  /** True when the answer was the stored one, not a fresh execution. */
  readonly replayed: boolean;
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly transaction: TransactionService) {}

  /**
   * The fingerprint of a request body.
   *
   * The body is canonicalised first (object keys sorted, array order kept), so
   * the same request written with its keys in another order is recognised as
   * the same request - and a request that differs in any value is not.
   */
  hashRequest(body: unknown): string {
    return createHash('sha256').update(canonicalJson(body)).digest('hex');
  }

  /**
   * Runs `work` at most once for this (organization, endpoint, key).
   *
   * The same key with the same request returns the stored response and creates
   * nothing; the same key with a different request is refused with
   * IDEMPOTENCY_KEY_REUSED.
   */
  async runOnce<T>(
    request: IdempotencyRequest,
    work: (tx: TransactionClient) => Promise<{ status: number; body: T }>,
  ): Promise<IdempotentOutcome<T>> {
    const key = request.key.trim();
    if (key === '') {
      throw new AppException(
        ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
        [
          {
            field: 'Idempotency-Key',
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'This request must carry an Idempotency-Key header.',
          },
        ],
        'This request must carry an Idempotency-Key header.',
      );
    }

    const requestHash = this.hashRequest(request.body);

    try {
      return await this.transaction.runInTransaction(async (tx) => {
        const existing = await tx.idempotencyKey.findUnique({
          where: {
            organizationId_endpoint_key: {
              organizationId: request.organizationId,
              endpoint: request.endpoint,
              key,
            },
          },
        });

        if (existing !== null) {
          if (existing.expiresAt.getTime() <= Date.now()) {
            // An expired claim is no claim: it is removed and the request runs.
            await tx.idempotencyKey.delete({ where: { id: existing.id } });
          } else {
            if (existing.requestHash !== requestHash) {
              throw idempotencyReused();
            }
            return {
              status: existing.responseStatus ?? 200,
              body: existing.responseBody as unknown as T,
              replayed: true,
            };
          }
        }

        const claim = await tx.idempotencyKey.create({
          data: {
            organizationId: request.organizationId,
            endpoint: request.endpoint,
            key,
            requestHash,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
          },
        });

        const result = await work(tx);

        await tx.idempotencyKey.update({
          where: { id: claim.id },
          data: {
            responseStatus: result.status,
            responseBody: result.body as unknown as Prisma.InputJsonValue,
          },
        });

        return { status: result.status, body: result.body, replayed: false };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // Another request with the same key won the race and committed while this
      // one was waiting on the unique index. Its answer is the answer.
      const stored = await this.findStored(request.organizationId, request.endpoint, key);
      if (stored !== null && stored.requestHash === requestHash) {
        return {
          status: stored.responseStatus ?? 200,
          body: stored.responseBody as unknown as T,
          replayed: true,
        };
      }
      throw idempotencyReused();
    }
  }

  /** Removes the claims that have expired. Returns how many were removed. */
  async purgeExpired(): Promise<number> {
    const result = await this.transaction.getClient().idempotencyKey.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return result.count;
  }

  private async findStored(organizationId: string, endpoint: string, key: string) {
    return this.transaction.getClient().idempotencyKey.findUnique({
      where: { organizationId_endpoint_key: { organizationId, endpoint, key } },
    });
  }
}

function idempotencyReused(): AppException {
  return new AppException(
    ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    [
      {
        field: 'Idempotency-Key',
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'This key was already used for a different request.',
      },
    ],
    'This request conflicts with an earlier request. Refresh and try again.',
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

/**
 * Canonical JSON: object keys sorted, array order kept, undefined dropped.
 *
 * Two requests that differ only in the order of their keys are the same
 * request; two that differ in any value are not.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
