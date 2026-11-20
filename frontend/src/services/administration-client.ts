import { requestJson } from '../lib/api-client';
import type { SampleRole, SampleUser, PermissionGroup, UserQuery, CreateUserInput, UpdateUserRolesInput } from './catalog-service';

const API_BASE = '/api/v1';
const JSON_HEADERS = { 'content-type': 'application/json' };

export interface MemberListResponse { readonly items: readonly SampleUser[]; readonly total: number; readonly page: number; readonly pageSize: number; }

function fail(res: any): never { throw new Error(res.failure?.message ?? 'Request failed'); }

export async function listMembers(query: UserQuery): Promise<MemberListResponse> {
  const qs = new URLSearchParams();
  if (query.search) qs.set('search', query.search);
  if (query.roleId) qs.set('role', query.roleId);
  if (query.status) qs.set('status', query.status === 'USER_ACTIVE' ? 'ACTIVE' : query.status === 'USER_DEACTIVATED' ? 'DEACTIVATED' : query.status);
  if (query.sort) qs.set('sort', query.sort === 'name' ? 'name' : query.sort === 'email' ? 'email' : query.sort === 'status' ? 'status' : 'createdAt');
  if (query.direction) qs.set('direction', query.direction);
  qs.set('page', String(query.page));
  qs.set('pageSize', String(query.pageSize));
  const res = await requestJson<{ items: any[]; total: number; page: number; pageSize: number }>(`${API_BASE}/memberships?${qs.toString()}`);
  if (!res.ok) fail(res);
  return {
    items: res.data.items.map((m: any) => ({
      id: m.id,
      name: m.displayName ?? m.email,
      email: m.email,
      roleIds: (m.roles ?? []).map((r: any) => r.id),
      status: m.status === 'ACTIVE' ? 'USER_ACTIVE' : 'USER_DEACTIVATED',
      passwordChangeRequired: Boolean(m.passwordChangeRequired),
      createdAt: m.createdAt,
    })),
    total: res.data.total,
    page: res.data.page,
    pageSize: res.data.pageSize,
  };
}

export async function createMember(input: CreateUserInput & { roleIds: readonly string[] }): Promise<{ name: string }> {
  const res = await requestJson<any>(`${API_BASE}/memberships`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: input.name, email: input.email, password: input.initialPassword, roleIds: input.roleIds }),
  });
  if (!res.ok) fail(res);
  return { name: input.name };
}

export async function updateMemberRoles(input: UpdateUserRolesInput): Promise<{ name: string }> {
  const res = await requestJson<any>(`${API_BASE}/memberships/${input.id}/roles`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ roleIds: input.roleIds }),
  });
  if (!res.ok) fail(res);
  return { name: '' };
}

export async function deactivateMember(id: string): Promise<{ name: string }> {
  const res = await requestJson<any>(`${API_BASE}/memberships/${id}/deactivate`, { method: 'POST' });
  if (!res.ok) fail(res);
  return { name: res.data?.membership?.id ?? '' };
}

export async function reactivateMember(id: string): Promise<{ name: string }> {
  const res = await requestJson<any>(`${API_BASE}/memberships/${id}/reactivate`, { method: 'POST' });
  if (!res.ok) fail(res);
  return { name: res.data?.membership?.id ?? '' };
}

export async function updateMemberName(id: string, name: string, version: number): Promise<void> {
  const res = await requestJson<any>(`${API_BASE}/memberships/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, version }),
  });
  if (!res.ok) fail(res);
}

export async function listRoles(): Promise<readonly SampleRole[]> {
  const res = await requestJson<any[]>(`${API_BASE}/roles`);
  if (!res.ok) fail(res);
  return res.data.map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    permissions: r.permissions ?? [],
    system: Boolean(r.isSystem),
  })) as any;
}

export async function getRole(id: string): Promise<SampleRole> {
  const res = await requestJson<any>(`${API_BASE}/roles/${id}`);
  if (!res.ok) fail(res);
  const r = res.data;
  return { id: r.id, name: r.name, description: r.description ?? '', permissions: r.permissions ?? [], system: Boolean(r.isSystem) } as any;
}

export async function createRole(input: { name: string; permissions: readonly string[] }): Promise<SampleRole> {
  const res = await requestJson<any>(`${API_BASE}/roles`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: input.name, key: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: '', permissionCodes: input.permissions }),
  });
  if (!res.ok) fail(res);
  const r = res.data;
  return { id: r.id ?? r.role?.id, name: r.name ?? input.name, description: '', permissions: input.permissions, system: false } as any;
}

export async function updateRolePermissions(input: { id: string; permissions: readonly string[] }): Promise<{ name: string }> {
  const role = await getRole(input.id);
  const res = await requestJson<any>(`${API_BASE}/roles/${input.id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: role.name, key: (role as any).key ?? role.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: role.description, permissionCodes: input.permissions }),
  });
  if (!res.ok) fail(res);
  return { name: role.name };
}

export async function deleteRole(id: string): Promise<{ name: string }> {
  const res = await requestJson<any>(`${API_BASE}/roles/${id}`, { method: 'DELETE' });
  if (!res.ok) fail(res);
  return { name: '' };
}

export async function listPermissions(): Promise<readonly PermissionGroup[]> {
  const res = await requestJson<any[]>(`${API_BASE}/roles/permissions`);
  if (!res.ok) fail(res);
  return res.data.map((g: any) => ({ module: g.module, label: g.label ?? g.module, permissions: g.permissions ?? [] }));
}