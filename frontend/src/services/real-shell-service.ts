/**
 * Real shell service - reads organizations and the current user from the
 * backend API instead of from mock data.
 *
 * Replaces `sample-shell-service.ts` once the backend is running. The
 * component layer (top bar, etc.) imports this through the same `ShellService`
 * interface, so no component changes are needed (FR-036, FR-037).
 */

import { requestJson, type ApiResult } from '../lib/api-client';
import type { PreviewUser, SampleOrganization, ShellService } from './shell-service';

const API_BASE = '/api/v1';

/** Map a backend organization to the shell's SampleOrganization shape. */
function toSampleOrganization(
  org: { readonly id: string; readonly name: string; readonly roleKey: string },
): SampleOrganization {
  return { id: org.id, name: org.name };
}

/** Map a backend me-response to the shell's PreviewUser shape. */
function toPreviewUser(me: {
  readonly user: { readonly id: string; readonly email: string };
  readonly membership: { readonly roleKey: string };
}): PreviewUser {
  return {
    id: me.user.id,
    name: me.user.email,
    role: me.membership.roleKey,
  };
}

async function listOrganizations(): Promise<readonly SampleOrganization[]> {
  const result: ApiResult<{ readonly id: string; readonly name: string; readonly roleKey: string }[]> =
    await requestJson(`${API_BASE}/auth/organizations`, { method: 'GET' });

  if (!result.ok) {
    throw new Error(result.failure.message ?? 'Failed to load organizations');
  }

  return result.data.map(toSampleOrganization);
}

async function getPreviewUser(): Promise<PreviewUser> {
  const result: ApiResult<{
    readonly user: { readonly id: string; readonly email: string };
    readonly membership: { readonly roleKey: string };
  }> = await requestJson(`${API_BASE}/auth/me`, { method: 'GET' });

  if (!result.ok) {
    throw new Error(result.failure.message ?? 'Failed to load current user');
  }

  return toPreviewUser(result.data);
}

/** The real implementation of the ShellService interface. */
export const shellService: ShellService = {
  listOrganizations,
  getPreviewUser,
};
