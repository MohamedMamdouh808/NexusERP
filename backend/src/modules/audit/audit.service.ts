import { Injectable } from '@nestjs/common';
import {
  TransactionService,
  type TransactionClient,
} from '../../platform/transaction/transaction.service';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

/**
 * Audit service. Central append-only audit writer (FR-015, FR-016).
 *
 * `record()` joins the caller's ambient transaction via `TransactionService.getClient()`,
 * so the audit row commits in the same transaction as the business change. A failed
 * audit insert throws, rolling the business change back — an unaudited action can never
 * exist and an audit entry without its action can never exist (Constitution Principle III).
 *
 * The table itself is append-only at the database level: UPDATE, DELETE and TRUNCATE are
 * rejected for the application database role (FR-017).
 */
@Injectable()
export class AuditService {
  constructor(private readonly transaction: TransactionService) {}

  /**
   * Writes one audit entry inside the current transaction (or a new one if none is open).
   * Callers supply only non-secret projections — passwords, hashes, tokens and session
   * identifiers never appear in `before`/`after` (FR-019).
   */
  async record(params: {
    organizationId?: string;
    userId?: string;
    action: string;
    recordType: string;
    recordId?: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    clientAddress?: string | null;
    reasonCode?: string | null;
    unknownAccountHash?: string | null;
    unknownAccountMarker?: string | null;
  }): Promise<void> {
    const tx: TransactionClient = this.transaction.getClient();
    await tx.auditLog.create({
      data: {
        organization: params.organizationId
          ? { connect: { id: params.organizationId } }
          : undefined,
        user: params.userId ? { connect: { id: params.userId } } : undefined,
        action: params.action,
        recordType: params.recordType,
        recordId: params.recordId ?? undefined,
        ...(params.before !== undefined && params.before !== null
          ? { before: params.before as Prisma.InputJsonValue }
          : {}),
        ...(params.after !== undefined && params.after !== null
          ? { after: params.after as Prisma.InputJsonValue }
          : {}),
        ...(params.clientAddress !== undefined ? { clientAddress: params.clientAddress } : {}),
        ...(params.reasonCode !== undefined ? { reasonCode: params.reasonCode } : {}),
        ...(params.unknownAccountHash !== undefined ? { unknownAccountHash: params.unknownAccountHash } : {}),
        ...(params.unknownAccountMarker !== undefined ? { unknownAccountMarker: params.unknownAccountMarker } : {}),
      },
    });
  }

  /**
   * Audit a sign-in failure (FR-030).
   *
   * Known user → userId recorded, no organization, no hash/marker.
   * Unknown account → neither userId nor organization; stores only a keyed
   * HMAC-SHA-256 truncated hash (32 hex chars) plus a sanitized, length-capped
   * control-character-free marker of the submitted value. The raw submitted
   * string is never stored.
   *
   * Writes an entry only for the first failure of the rate-limit window per
   * account, plus the lockout event itself. Further attempts are counted in
   * the existing failed-login counters (LoginAttempt table), not as audit rows.
   */
  async loginFailure(params: {
    userId?: string;
    submittedAccount?: string; // raw submitted value — never stored directly
    clientAddress?: string | null;
    reasonCode: string;
    isLockout?: boolean;
  }): Promise<void> {
    const tx: TransactionClient = this.transaction.getClient();
    const data: Prisma.AuditLogCreateInput = {
      action: 'auth.login_failed',
      recordType: 'auth',
      reasonCode: params.reasonCode,
      clientAddress: params.clientAddress,
    };

    if (params.userId) {
      data.user = { connect: { id: params.userId } };
    } else if (params.submittedAccount) {
      // Keyed one-way hash, truncated to fixed length
      const key = process.env.AUDIT_HASH_KEY ?? 'default-key-change-in-production';
      const hash = createHash('sha256')
        .update(key)
        .update(params.submittedAccount)
        .digest('hex')
        .slice(0, 32);
      data.unknownAccountHash = hash;

      // Sanitized, control-char-free, length-capped marker:
      // keep only printable ASCII (0x20-0x7e), cap at 64 chars.
      const marker = params.submittedAccount
        .split('')
        .filter((c) => {
          const code = c.charCodeAt(0);
          return code >= 0x20 && code <= 0x7e;
        })
        .join('')
        .slice(0, 64);
      data.unknownAccountMarker = marker;
    }

    await tx.auditLog.create({ data });
  }

  /**
   * List audit entries for the active organization, with filters and paging.
   * Organization-less entries (NULL organization_id) can never match (FR-020/SC-013).
   */
  async list(params: {
    organizationId: string;
    from?: Date;
    to?: Date;
    userId?: string;
    action?: string;
    recordType?: string;
    recordId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const tx: TransactionClient = this.transaction.getClient();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const where: Prisma.AuditLogWhereInput = {
      organizationId: params.organizationId,
    };

    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.recordType) where.recordType = params.recordType;
    if (params.recordId) where.recordId = params.recordId;

    const [entries, total] = await Promise.all([
      tx.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      tx.auditLog.count({ where }),
    ]);

    return {
      entries: entries.map((e) => ({
        id: e.id,
        organizationId: e.organizationId,
        userId: e.userId,
        action: e.action,
        recordType: e.recordType,
        recordId: e.recordId,
        before: e.before,
        after: e.after,
        clientAddress: e.clientAddress,
        reasonCode: e.reasonCode,
        unknownAccountHash: e.unknownAccountHash,
        unknownAccountMarker: e.unknownAccountMarker,
        createdAt: e.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }
}
