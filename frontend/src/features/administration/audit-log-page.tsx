import { useTranslation } from 'react-i18next';

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, DataTable, Dialog, EmptyState, ErrorState, Input, Select, Skeleton } from '../../components/ui';
import type { Column } from '../../components/ui';
import { formatDateTime } from '../../lib/i18n-format';
import type { AuditEntry } from '../../services/catalog-service';
import { useAllUsers, useAudit, useAuditEntry } from './use-administration';

function recordLink(entry: AuditEntry): string | null {
  if (!entry.recordId) return null;
  if (entry.recordType === 'Sales order') return `/sales/${entry.recordId}`;
  if (entry.recordType === 'Purchase order') return `/purchasing/${entry.recordId}`;
  if (entry.recordType === 'Invoice') return `/invoicing/${entry.recordId}`;
  if (entry.recordType === 'Payment') return `/invoicing/payments/${entry.recordId}`;
  if (entry.recordType === 'User') return '/users';
  if (entry.recordType === 'Role') return `/users/roles/${entry.recordId}`;
  if (entry.recordType === 'Organization' || entry.recordType === 'Module') return '/settings/organization';
  if (entry.recordType === 'Goods receipt') return '/purchasing/receipts';
  if (entry.recordType === 'Shipment') return '/sales/shipments';
  if (entry.recordType === 'Adjustment') return '/inventory';
  return null;
}
export function AuditLogPage() {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState(''); const [userId, setUserId] = useState(''); const [action, setAction] = useState(''); const [recordType, setRecordType] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [selectedId, setSelectedId] = useState('');
  const query = useAudit({ startDate: startDate || undefined, endDate: endDate || undefined, userId: userId || undefined, action: action || undefined, recordType: recordType || undefined, search: search || undefined, page, pageSize: 20 });
  const users = useAllUsers(); const filterOptions = useAudit({ page: 1, pageSize: 100 }); const details = useAuditEntry(selectedId);
  const invalidRange = Boolean(startDate && endDate && endDate < startDate);
  const actions = [...new Map((filterOptions.data?.items ?? []).map((entry) => [entry.action, entry.actionLabel])).entries()].map(([value, label]) => ({ value, label }));
  const types = [...new Set((filterOptions.data?.items ?? []).map((entry) => entry.recordType))].map((value) => ({ value, label: value }));
  const columns: Column<AuditEntry>[] = [
    { key: 'time', header: t('administration.audit.columns.time'), render: (entry) => formatDateTime(entry.time) },
    { key: 'userName', header: t('administration.audit.columns.user') }, { key: 'actionLabel', header: t('administration.audit.columns.action') },
    { key: 'recordNumber', header: t('administration.audit.columns.record'), render: (entry) => { const href = recordLink(entry); const label = `${entry.recordType}: ${entry.recordNumber}`; return href ? <Link to={href}>{label}</Link> : label; } },
    { key: 'summary', header: t('administration.audit.columns.summary') },
    { key: 'details', header: t('administration.audit.columns.details'), render: (entry) => <Button onClick={() => setSelectedId(entry.id)}>{t('administration.audit.viewDetails')}</Button> },
  ];
  const filtersActive = Boolean(startDate || endDate || userId || action || recordType || search);
  function clearFilters() { setStartDate(''); setEndDate(''); setUserId(''); setAction(''); setRecordType(''); setSearch(''); setPage(1); }
  return <section className="audit-page" aria-label={t('administration.audit.sectionAria')}><PageHeader title={t('administration.audit.title')} description={t('administration.audit.description')}/>
    <Card title={t('administration.audit.cardTitle')} description={t('administration.audit.cardDescription')}><div className="admin-toolbar audit-toolbar"><Input id="audit-start" label={t('administration.audit.from')} type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }}/><Input id="audit-end" label={t('administration.audit.to')} type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }}/><Select id="audit-user" label={t('administration.audit.user')} value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} options={(users.data?.items ?? []).map((user) => ({ value:user.id,label:user.name }))} placeholder={t('administration.audit.allUsers')}/><Select id="audit-action" label={t('administration.audit.action')} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} options={actions} placeholder={t('administration.audit.allActions')}/><Select id="audit-record-type" label={t('administration.audit.recordType')} value={recordType} onChange={(e) => { setRecordType(e.target.value); setPage(1); }} options={types} placeholder={t('administration.audit.allRecordTypes')}/><Input id="audit-search" label={t('administration.audit.searchRecordNumber')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('administration.audit.searchPlaceholder')}/></div>
      {invalidRange && <p className="form-error" role="alert">{t('administration.audit.endOnOrAfterStart')}</p>}
      {invalidRange ? null : query.isError ? <ErrorState message={t('administration.audit.loadError')} onRetry={() => void query.refetch()}/> : query.data?.total === 0 ? <EmptyState title={filtersActive ? t('administration.audit.emptyFilteredTitle') : t('administration.audit.emptyTitle')} description={filtersActive ? t('administration.audit.emptyFilteredDescription') : t('administration.audit.emptyDescription')} actionLabel={filtersActive ? t('common.form.clearFilters') : undefined} onAction={filtersActive ? clearFilters : undefined}/> : <DataTable<AuditEntry> columns={columns} data={query.data?.items ?? []} total={query.data?.total ?? 0} page={page} pageSize={20} loading={query.isPending} onPageChange={setPage}/>}
    </Card>
    <Dialog open={Boolean(selectedId)} onClose={() => setSelectedId('')} title={t('administration.audit.detailTitle')} actions={<Button onClick={() => setSelectedId('')}>{t('common.actions.close')}</Button>}>
      {details.isPending ? <Skeleton label={t('administration.audit.loadingRecord')}/> : details.data ? <><dl className="audit-detail-summary"><dt>{t('administration.audit.actionCode')}</dt><dd><code>{details.data.action}</code></dd><dt>{t('administration.audit.user')}</dt><dd>{details.data.userName}</dd><dt>{t('administration.audit.columns.time')}</dt><dd>{formatDateTime(details.data.time)}</dd><dt>{t('administration.audit.record')}</dt><dd>{details.data.recordType}: {details.data.recordNumber}</dd><dt>{t('administration.audit.summary')}</dt><dd>{details.data.summary}</dd></dl><div className="table-container"><table className="data-table"><thead><tr><th>{t('administration.audit.field')}</th><th>{t('administration.audit.before')}</th><th>{t('administration.audit.after')}</th></tr></thead><tbody>{details.data.changes.map((change) => <tr key={`${change.field}-${change.before}-${change.after}`}><td>{change.field}</td><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table></div></> : <ErrorState message={t('administration.audit.recordLoadError')} onRetry={() => void details.refetch()}/>}
    </Dialog>
  </section>;
}
