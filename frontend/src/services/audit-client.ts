import { requestJson, type ApiResult } from '../lib/api-client';

const API_BASE = '/api/v1';

/**
 * One audit entry as the service answers it.
 *
 * The entries carry the action, the record it touched and the before/after
 * projections the service recorded. The service never writes a password, a
 * hash or a session identifier into them, so nothing here has to be hidden.
 */
export interface AuditEntry {
  readonly id: string;
  readonly organizationId: string | null;
  readonly userId: string | null;
  readonly action: string;
  readonly recordType: string;
  readonly recordId: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly clientAddress: string | null;
  readonly reasonCode: string | null;
  readonly createdAt: string;
}

export interface AuditEntryPage {
  readonly entries: readonly AuditEntry[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListAuditEntriesParams {
  readonly from?: string;
  readonly to?: string;
  readonly userId?: string;
  readonly action?: string;
  readonly recordType?: string;
  readonly recordId?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export async function listAuditEntries(
  params: ListAuditEntriesParams = {},
): Promise<ApiResult<AuditEntryPage>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  const queryString = query.toString();
  return requestJson<AuditEntryPage>(
    `${API_BASE}/audit-logs${queryString ? `?${queryString}` : ''}`,
    { method: 'GET' },
  );
}
