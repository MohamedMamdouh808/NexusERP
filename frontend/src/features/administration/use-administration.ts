import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sampleCatalogService } from '../../services/sample-catalog-service';
import type { AuditQuery, CreateRoleInput, CreateUserInput, ToggleModuleInput, UpdateOrganizationSettingsInput, UpdateRolePermissionsInput, UpdateUserRolesInput, UserQuery } from '../../services/catalog-service';

const keys = { organization: ['organization'] as const, modules: ['modules'] as const, users: ['users'] as const, roles: ['roles'] as const, permissions: ['permissions'] as const, audit: ['audit'] as const };
function refresh(queryClient: ReturnType<typeof useQueryClient>) { for (const queryKey of Object.values(keys)) void queryClient.invalidateQueries({ queryKey }); void queryClient.invalidateQueries({ queryKey: ['shell', 'organizations'] }); void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); }
export const useOrganization = () => useQuery({ queryKey: keys.organization, queryFn: () => sampleCatalogService.getOrganization() });
export const useModules = () => useQuery({ queryKey: keys.modules, queryFn: () => sampleCatalogService.listModules() });
export const useUsers = (query: UserQuery) => useQuery({ queryKey: [...keys.users, query], queryFn: () => sampleCatalogService.listUsers(query) });
export const useAllUsers = () => useQuery({ queryKey: [...keys.users, 'all'], queryFn: () => sampleCatalogService.listUsers({ page: 1, pageSize: 100 }) });
export const useUser = (id: string) => useQuery({ queryKey: [...keys.users, id], queryFn: () => sampleCatalogService.getUser(id), enabled: id !== '' });
export const useRoles = () => useQuery({ queryKey: keys.roles, queryFn: () => sampleCatalogService.listRoles() });
export const useRole = (id: string) => useQuery({ queryKey: [...keys.roles, id], queryFn: () => sampleCatalogService.getRole(id), enabled: id !== '' && id !== 'new' });
export const usePermissions = () => useQuery({ queryKey: keys.permissions, queryFn: () => sampleCatalogService.listPermissions() });
export const useAudit = (query: AuditQuery) => useQuery({ queryKey: [...keys.audit, query], queryFn: () => sampleCatalogService.listAuditEntries(query) });
export const useAuditEntry = (id: string) => useQuery({ queryKey: [...keys.audit, id], queryFn: () => sampleCatalogService.getAuditEntry(id), enabled: id !== '' });
export function useUpdateOrganization() { const c = useQueryClient(); return useMutation({ mutationFn: (input: UpdateOrganizationSettingsInput) => sampleCatalogService.updateOrganizationSettings(input), onSuccess: () => refresh(c) }); }
export function useToggleModule() { const c = useQueryClient(); return useMutation({ mutationFn: (input: ToggleModuleInput) => sampleCatalogService.toggleModule(input), onSuccess: () => refresh(c) }); }
export function useCreateUser() { const c = useQueryClient(); return useMutation({ mutationFn: (input: CreateUserInput) => sampleCatalogService.createUser(input), onSuccess: () => refresh(c) }); }
export function useUpdateUserRoles() { const c = useQueryClient(); return useMutation({ mutationFn: (input: UpdateUserRolesInput) => sampleCatalogService.updateUserRoles(input), onSuccess: () => refresh(c) }); }
export function useDeactivateUser() { const c = useQueryClient(); return useMutation({ mutationFn: (id: string) => sampleCatalogService.deactivateUser(id), onSuccess: () => refresh(c) }); }
export function useReactivateUser() { const c = useQueryClient(); return useMutation({ mutationFn: (id: string) => sampleCatalogService.reactivateUser(id), onSuccess: () => refresh(c) }); }
export function useCreateRole() { const c = useQueryClient(); return useMutation({ mutationFn: (input: CreateRoleInput) => sampleCatalogService.createRole(input), onSuccess: () => refresh(c) }); }
export function useUpdateRolePermissions() { const c = useQueryClient(); return useMutation({ mutationFn: (input: UpdateRolePermissionsInput) => sampleCatalogService.updateRolePermissions(input), onSuccess: () => refresh(c) }); }
export function useDeleteRole() { const c = useQueryClient(); return useMutation({ mutationFn: (id: string) => sampleCatalogService.deleteRole(id), onSuccess: () => refresh(c) }); }
