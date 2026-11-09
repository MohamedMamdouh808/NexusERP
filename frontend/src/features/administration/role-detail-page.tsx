import { useEffect, useState } from 'react';
import { SampleDataBanner } from '../../components/ui/sample-data-banner';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, ConfirmDialog, ErrorState, Skeleton, Toast } from '../../components/ui';
import type { ToastTone } from '../../components/ui';
import { useDeleteRole, usePermissions, useRole, useUpdateRolePermissions } from './use-administration';
import { PermissionChecklist } from './users-page';

export function RoleDetailPage() {
  const { id = '' } = useParams(); const navigate = useNavigate(); const query = useRole(id); const permissionQuery = usePermissions(); const update = useUpdateRolePermissions(); const remove = useDeleteRole();
  const [selected, setSelected] = useState<string[]>([]); const [deleteOpen, setDeleteOpen] = useState(false); const [error, setError] = useState(''); const [toasts, setToasts] = useState<{id:string;tone:ToastTone;message:string}[]>([]);
  useEffect(() => { if (query.data) setSelected([...query.data.permissions]); }, [query.data]);
  if (query.isPending || permissionQuery.isPending) return <section><PageHeader title="Role"/><SampleDataBanner moduleKey="administration" /><Card title="Role"><Skeleton label="Loading role"/></Card></section>;
  if (query.isError || permissionQuery.isError || !query.data) return <section><PageHeader title="Role"/><SampleDataBanner moduleKey="administration" /><ErrorState message="Role could not be loaded." onRetry={() => { void query.refetch(); void permissionQuery.refetch(); }}/></section>;
  const role = query.data;
  function toast(message: string, tone: ToastTone = 'success') { setToasts((items) => [...items, { id: `role-${Date.now()}`, tone, message }]); }
  return <section className="role-detail-page"><PageHeader title={role.name} description={role.system ? 'System role' : 'Custom role'} primaryAction={<div className="invoice-header-actions"><Button onClick={() => navigate('/users/roles')}>Back to roles</Button>{!role.system && <><Button variant="primary" loading={update.isPending} disabled={update.isPending || selected.length === 0} onClick={() => update.mutate({ id: role.id, permissions: selected }, { onSuccess: (result) => toast(`${result.name} permissions saved`), onError: (e) => setError(e instanceof Error ? e.message : 'Permissions could not be saved.') })}>Save permissions</Button><Button variant="danger" onClick={() => { setError(''); setDeleteOpen(true); }}>Delete role</Button></>}</div>}/><SampleDataBanner moduleKey="administration" />
    <Card title="Permissions" description={role.system ? 'System roles cannot be edited.' : 'Select the permissions granted by this custom role.'}>{role.system && <p className="settings-notice">System roles cannot be edited.</p>}<PermissionChecklist groups={permissionQuery.data ?? []} selected={selected} onChange={setSelected} disabled={role.system}/>{error && <p className="form-error" role="alert">{error}</p>}</Card>
    <ConfirmDialog open={deleteOpen} onClose={() => { if (!remove.isPending) setDeleteOpen(false); }} onConfirm={() => remove.mutate(role.id, { onSuccess: (result) => { setDeleteOpen(false); toast(`${result.name} deleted`); navigate('/users/roles'); }, onError: (e) => setError(e instanceof Error ? e.message : 'Role could not be deleted.') })} title="Delete role?" description="This custom role will be removed. User records and audit history remain." actionLabel="Delete role" destructive loading={remove.isPending} error={error}/>
    {toasts.map((item) => <Toast key={item.id} id={item.id} tone={item.tone} message={item.message} onDismiss={() => setToasts((items) => items.filter((t) => t.id !== item.id))}/>)}
  </section>;
}
