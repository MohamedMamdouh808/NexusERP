import { useTranslation } from 'react-i18next';

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, ConfirmDialog, ErrorState, Skeleton, Toast } from '../../components/ui';
import type { ToastTone } from '../../components/ui';
import { useDeleteRole, usePermissions, useRole, useUpdateRolePermissions } from './use-administration';
import { PermissionChecklist } from './users-page';

export function RoleDetailPage() {
  const { id = '' } = useParams(); const navigate = useNavigate(); const query = useRole(id); const permissionQuery = usePermissions(); const update = useUpdateRolePermissions(); const remove = useDeleteRole(); const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]); const [deleteOpen, setDeleteOpen] = useState(false); const [error, setError] = useState(''); const [toasts, setToasts] = useState<{id:string;tone:ToastTone;message:string}[]>([]);
  useEffect(() => { if (query.data) setSelected([...query.data.permissions]); }, [query.data]);
  if (query.isPending || permissionQuery.isPending) return <section aria-label={t('administration.roleDetail.sectionAria')}><PageHeader title={t('administration.roleDetail.title')}/><Card title={t('administration.roleDetail.title')}><Skeleton label={t('administration.roleDetail.loading')}/></Card></section>;
  if (query.isError || permissionQuery.isError || !query.data) return <section aria-label={t('administration.roleDetail.sectionAria')}><PageHeader title={t('administration.roleDetail.title')}/><ErrorState message={t('administration.roleDetail.loadError')} onRetry={() => { void query.refetch(); void permissionQuery.refetch(); }}/></section>;
  const role = query.data;
  function toast(message: string, tone: ToastTone = 'success') { setToasts((items) => [...items, { id: `role-${Date.now()}`, tone, message }]); }
  return <section className="role-detail-page"><PageHeader title={role.name} description={role.system ? t('administration.roleDetail.systemRole') : t('administration.roleDetail.customRole')} primaryAction={<div className="invoice-header-actions"><Button onClick={() => navigate('/users/roles')}>{t('administration.roleDetail.backToRoles')}</Button>{!role.system && <><Button variant="primary" loading={update.isPending} disabled={update.isPending || selected.length === 0} onClick={() => update.mutate({ id: role.id, permissions: selected }, { onSuccess: (result) => toast(t('administration.roleDetail.permissionsSavedToast', { name: result.name })), onError: (e) => setError(e instanceof Error ? e.message : t('administration.roleDetail.permissionsSaveFailed')) })}>{t('administration.roleDetail.savePermissions')}</Button><Button variant="danger" onClick={() => { setError(''); setDeleteOpen(true); }}>{t('administration.roleDetail.deleteRole')}</Button></>}</div>}/>
    <Card title={t('administration.roleDetail.permissions')} description={role.system ? t('administration.roleDetail.systemPermissionsDescription') : t('administration.roleDetail.customPermissionsDescription')}>{role.system && <p className="settings-notice">{t('administration.roleDetail.systemPermissionsDescription')}</p>}<PermissionChecklist groups={permissionQuery.data ?? []} selected={selected} onChange={setSelected} disabled={role.system}/>{error && <p className="form-error" role="alert">{error}</p>}</Card>
    <ConfirmDialog open={deleteOpen} onClose={() => { if (!remove.isPending) setDeleteOpen(false); }} onConfirm={() => remove.mutate(role.id, { onSuccess: (result) => { setDeleteOpen(false); toast(t('administration.roleDetail.deletedToast', { name: result.name })); navigate('/users/roles'); }, onError: (e) => setError(e instanceof Error ? e.message : t('administration.roleDetail.roleDeleteFailed')) })} title={t('administration.roleDetail.deleteTitle')} description={t('administration.roleDetail.deleteDescription')} actionLabel={t('administration.roleDetail.deleteRole')} destructive loading={remove.isPending} error={error}/>
    {toasts.map((item) => <Toast key={item.id} id={item.id} tone={item.tone} message={item.message} onDismiss={() => setToasts((items) => items.filter((t) => t.id !== item.id))}/>)}
  </section>;
}
