import { useQuery } from '@tanstack/react-query';

import { HEALTH_PATH, requestJson, type ApiFailure } from '../../lib/api-client';
import type { HealthReport } from '@nexuserp/shared';

export type HealthState =
  | { readonly kind: 'healthy'; readonly report: HealthReport }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

/**
 * Reads the health address (FR-033).
 *
 * `retry: false` is deliberate: a person clicking "Check again" expects exactly
 * one attempt, and the service's own `Retry-After` is surfaced to them rather than
 * being silently obeyed by an automatic retry loop that hides the limit.
 */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<HealthState> => {
      const result = await requestJson<HealthReport>(HEALTH_PATH);
      return result.ok
        ? { kind: 'healthy', report: result.data }
        : { kind: 'failed', failure: result.failure };
    },
    retry: false,
    staleTime: 0,
  });
}