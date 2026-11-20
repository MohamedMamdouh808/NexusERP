/**
 * Frontend client for organization settings and module availability.
 *
 * Every result is the shared `ApiResult`, so callers branch on `failure.code`
 * (STALE_VERSION, CURRENCY_LOCKED, MODULE_DEPENDENCY, MODULE_IN_USE) rather than
 * on human-readable text. The service is the authority; the UI only reflects it.
 */

import { requestJson, type ApiFailure, type ApiResult } from '../lib/api-client';

const API_BASE = '/api/v1';
const JSON_HEADERS = { 'content-type': 'application/json' };

export interface ModuleSetting {
  readonly key: string;
  readonly enabled: boolean;
  readonly version: number;
  readonly locked: boolean;
}

export interface OrganizationSettings {
  readonly id: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly defaultPaymentTermsDays: number;
  readonly version: number;
  readonly currencyLocked: boolean;
  readonly modules: readonly ModuleSetting[];
}

export interface UpdateOrganizationSettingsInput {
  readonly name: string;
  readonly currencyCode: string;
  readonly defaultPaymentTermsDays: number;
  readonly version: number;
}

export interface ToggleModuleInput {
  readonly key: string;
  readonly enabled: boolean;
  readonly version: number;
}

export function getOrganizationSettings(): Promise<ApiResult<OrganizationSettings>> {
  return requestJson<OrganizationSettings>(`${API_BASE}/organizations/current`);
}

export function updateOrganizationSettings(
  input: UpdateOrganizationSettingsInput,
): Promise<ApiResult<OrganizationSettings>> {
  return requestJson<OrganizationSettings>(`${API_BASE}/organizations/current`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function getOrganizationModules(): Promise<ApiResult<{ modules: readonly ModuleSetting[] }>> {
  return requestJson<{ modules: readonly ModuleSetting[] }>(`${API_BASE}/organizations/current/modules`);
}

export function toggleOrganizationModule(
  input: ToggleModuleInput,
): Promise<ApiResult<{ key: string; enabled: boolean; version: number }>> {
  return requestJson<{ key: string; enabled: boolean; version: number }>(
    `${API_BASE}/organizations/current/modules/${encodeURIComponent(input.key)}`,
    {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ enabled: input.enabled, version: input.version }),
    },
  );
}

export function failureOf(result: ApiResult<unknown>): ApiFailure | null {
  return result.ok ? null : result.failure;
}
