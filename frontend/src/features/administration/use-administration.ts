import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as adminClient from '../../services/administration-client';
import { listAuditEntries } from '../../services/audit-client';
import type { AuditChange, AuditQuery, CreateRoleInput, CreateUserInput, UpdateRolePermissionsInput, UpdateUserRolesInput, UserQuery } from '../../services/catalog-service';

function toChanges(entry: { before: unknown; after: unknown }): readonly AuditChange[] {
  const values = (entry.after ?? entry.before ?? {}) as Record<string, unknown>;
  return Object.entries(values).map(([field, value]) => ({
    field,
    before: '',
    after: typeof value === 'object' ? JSON.stringify(value) : String(value),
  }));
}

const keys = { users: ['users'] as const, roles: ['roles'] as const, permissions: ['permissions'] as const, audit: ['audit'] as const };
function refresh(queryClient: ReturnType<typeof useQueryClient>) { for (const queryKey of Object.values(keys)) void queryClient.invalidateQueries({ queryKey }); void queryClient.invalidateQueries({ queryKey: ['shell', 'organizations'] }); void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); }
export const useUsers = (query: UserQuery) => useQuery({ queryKey: [...keys.users, query], queryFn: () => adminClient.listMembers(query) });
export const useAllUsers = () => useQuery({ queryKey: [...keys.users, 'all'], queryFn: () => adminClient.listMembers({ page: 1, pageSize: 100 }) });
export const useUser = (_id: string) => useQuery({ queryKey: [...keys.users, _id], queryFn: async () => null, enabled: false });
export const useRoles = () => useQuery({ queryKey: keys.roles, queryFn: () => adminClient.listRoles() });
export const useRole = (id: string) => useQuery({ queryKey: [...keys.roles, id], queryFn: () => adminClient.getRole(id), enabled: id !== '' && id !== 'new' });
export const usePermissions = () => useQuery({ queryKey: keys.permissions, queryFn: () => adminClient.listPermissions() });
export const useAudit = (query: AuditQuery) =>
  useQuery({
    queryKey: [...keys.audit, query],
    queryFn: async () => {
      const result = await listAuditEntries({
        from: query.startDate,
        to: query.endDate,
        userId: query.userId,
        action: query.action,
        recordType: query.recordType,
        page: query.page,
        pageSize: query.pageSize,
      });
      if (!result.ok) throw new Error(result.failure.message);
      return {
        items: result.data.entries.map((entry) => ({
          id: entry.id,
          time: entry.createdAt,
          userId: entry.userId,
          userName: entry.userId ?? 'Unknown',
          action: entry.action,
          actionLabel: entry.action,
          recordType: entry.recordType,
          recordId: entry.recordId,
          recordNumber: entry.recordId ?? '',
          summary: entry.action,
          changes: toChanges(entry),
        })),
        total: result.data.total,
      };
    },
  });
export const useAuditEntry = (id: string) =>
  useQuery({
    queryKey: [...keys.audit, id],
    queryFn: async () => {
      const result = await listAuditEntries({ recordId: id, page: 1, pageSize: 1 });
      if (!result.ok) throw new Error(result.failure.message);
      const entry = result.data.entries[0];
      return entry
        ? {
            id: entry.id,
            time: entry.createdAt,
            userId: entry.userId,
            userName: entry.userId ?? 'Unknown',
            action: entry.action,
            actionLabel: entry.action,
            recordType: entry.recordType,
            recordId: entry.recordId,
            recordNumber: entry.recordId ?? '',
            summary: entry.action,
            changes: toChanges(entry),
          }
        : null;
    },
    enabled: id !== '',
  });
export function useCreateUser() { const c = useQueryClient(); return useMutation({ mutationFn: (input: CreateUserInput) => adminClient.createMember({ ...input, roleIds: input.roleIds }), onSuccess: () => refresh(c) }); }
export function useUpdateUserRoles() { const c = useQueryClient(); return useMutation({ mutationFn: (input: UpdateUserRolesInput) => adminClient.updateMemberRoles(input), onSuccess: () => refresh(c) }); }
export function useDeactivateUser() { const c = useQueryClient(); return useMutation({ mutationFn: (id: string) => adminClient.deactivateMember(id), onSuccess: () => refresh(c) }); }
export function useReactivateUser() { const c = useQueryClient(); return useMutation({ mutationFn: (id: string) => adminClient.reactivateMember(id), onSuccess: () => refresh(c) }); }
export function useCreateRole() { const c = useQueryClient(); return useMutation({ mutationFn: (input: CreateRoleInput) => adminClient.createRole(input), onSuccess: () => refresh(c) }); }
export function useUpdateRolePermissions() { const c = useQueryClient(); return useMutation({ mutationFn: (input: UpdateRolePermissionsInput) => adminClient.updateRolePermissions(input), onSuccess: () => refresh(c) }); }
export function useDeleteRole() { const c = useQueryClient(); return useMutation({ mutationFn: (id: string) => adminClient.deleteRole(id), onSuccess: () => refresh(c) }); }