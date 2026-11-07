import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, DataTable, Dialog, EmptyState, ErrorState, Input, Select, Skeleton } from '../../components/ui';
import type { Column } from '../../components/ui';
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
  const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState(''); const [userId, setUserId] = useState(''); const [action, setAction] = useState(''); const [recordType, setRecordType] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [selectedId, setSelectedId] = useState('');
  const query = useAudit({ startDate: startDate || undefined, endDate: endDate || undefined, userId: userId || undefined, action: action || undefined, recordType: recordType || undefined, search: search || undefined, page, pageSize: 20 });
  const users = useAllUsers(); const filterOptions = useAudit({ page: 1, pageSize: 100 }); const details = useAuditEntry(selectedId);
  const invalidRange = Boolean(startDate && endDate && endDate < startDate);
  const actions = [...new Map((filterOptions.data?.items ?? []).map((entry) => [entry.action, entry.actionLabel])).entries()].map(([value, label]) => ({ value, label }));
  const types = [...new Set((filterOptions.data?.items ?? []).map((entry) => entry.recordType))].map((value) => ({ value, label: value }));
  const columns: Column<AuditEntry>[] = [
    { key: 'time', header: 'Time', render: (entry) => new Date(entry.time).toLocaleString() },
    { key: 'userName', header: 'User' }, { key: 'actionLabel', header: 'Action' },
    { key: 'recordNumber', header: 'Record', render: (entry) => { const href = recordLink(entry); const label = `${entry.recordType}: ${entry.recordNumber}`; return href ? <Link to={href}>{label}</Link> : label; } },
    { key: 'summary', header: 'Summary' },
    { key: 'details', header: 'Details', render: (entry) => <Button onClick={() => setSelectedId(entry.id)}>View details</Button> },
  ];
  const filtersActive = Boolean(startDate || endDate || userId || action || recordType || search);
  function clearFilters() { setStartDate(''); setEndDate(''); setUserId(''); setAction(''); setRecordType(''); setSearch(''); setPage(1); }
  return <section className="audit-page" aria-label="Audit log"><PageHeader title="Audit Log" description="Access to this page is enforced by the server; hiding a control is not security."/><div className="sample-banner">Sample data</div>
    <Card title="Audit Log" description="Audit records are permanent."><div className="admin-toolbar audit-toolbar"><Input id="audit-start" label="From" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }}/><Input id="audit-end" label="To" type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }}/><Select id="audit-user" label="User" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} options={(users.data?.items ?? []).map((user) => ({ value:user.id,label:user.name }))} placeholder="All users"/><Select id="audit-action" label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} options={actions} placeholder="All actions"/><Select id="audit-record-type" label="Record type" value={recordType} onChange={(e) => { setRecordType(e.target.value); setPage(1); }} options={types} placeholder="All record types"/><Input id="audit-search" label="Search record number" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="SO-000012"/></div>
      {invalidRange && <p className="form-error" role="alert">End date must be on or after the start date.</p>}
      {invalidRange ? null : query.isError ? <ErrorState message="Audit records could not be loaded." onRetry={() => void query.refetch()}/> : query.data?.total === 0 ? <EmptyState title={filtersActive ? 'No audit records match these filters' : 'No audit records yet'} description={filtersActive ? 'Clear filters to see all records.' : 'Activity appears here as sample actions are performed.'} actionLabel={filtersActive ? 'Clear filters' : undefined} onAction={filtersActive ? clearFilters : undefined}/> : <DataTable<AuditEntry> columns={columns} data={query.data?.items ?? []} total={query.data?.total ?? 0} page={page} pageSize={20} loading={query.isPending} onPageChange={setPage}/>}
    </Card>
    <Dialog open={Boolean(selectedId)} onClose={() => setSelectedId('')} title="Audit record" actions={<Button onClick={() => setSelectedId('')}>Close</Button>}>
      {details.isPending ? <Skeleton label="Loading audit record"/> : details.data ? <><dl className="audit-detail-summary"><dt>Action code</dt><dd><code>{details.data.action}</code></dd><dt>User</dt><dd>{details.data.userName}</dd><dt>Time</dt><dd>{new Date(details.data.time).toLocaleString()}</dd><dt>Record</dt><dd>{details.data.recordType}: {details.data.recordNumber}</dd><dt>Summary</dt><dd>{details.data.summary}</dd></dl><div className="table-container"><table className="data-table"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{details.data.changes.map((change) => <tr key={`${change.field}-${change.before}-${change.after}`}><td>{change.field}</td><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table></div></> : <ErrorState message="Audit record could not be loaded." onRetry={() => void details.refetch()}/>}
    </Dialog>
  </section>;
}
