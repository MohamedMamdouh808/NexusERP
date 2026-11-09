import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { SampleDataBanner } from '../../components/ui/sample-data-banner';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  KebabMenu,
  Select,
  Skeleton,
} from '../../components/ui';
import type { Column } from '../../components/ui';
import { useContacts } from './use-contacts';

const ROLES = ['CUSTOMER', 'SUPPLIER'] as const;
const STATUSES = ['ACTIVE', 'ARCHIVED'] as const;

function roleTone(role: string): 'success' | 'warning' | 'info' | 'neutral' | 'destructive' {
  if (role === 'CUSTOMER') return 'success';
  if (role === 'SUPPLIER') return 'info';
  return 'neutral';
}

function statusTone(status: string): 'success' | 'warning' | 'info' | 'neutral' | 'destructive' {
  if (status === 'ARCHIVED') return 'destructive';
  if (status === 'ACTIVE') return 'success';
  return 'neutral';
}

export function ContactsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const { data, isPending, isError, error } = useContacts({
    search,
    role: (role as 'CUSTOMER' | 'SUPPLIER') || undefined,
    status: (status as 'ACTIVE' | 'ARCHIVED') || undefined,
    page,
    pageSize,
    sort: 'code',
    direction: 'asc',
  });

  const contacts = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Column<{
    id: string;
    code: string;
    name: string;
    role: string;
    status: string;
    email: string;
    phone: string;
    address: string;
  }>[] = useMemo(
    () => [
      { key: 'code', header: 'Code' },
      { key: 'name', header: 'Name' },
      { key: 'role', header: 'Role', render: (row) => <Badge tone={roleTone(row.role)}>{row.role}</Badge> },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge> },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone' },
      {
        key: 'actions',
        header: 'Actions',
        render: (row) => {
          const archived = row.status === 'ARCHIVED';
          const entries = [
            { kind: 'item' as const, id: 'view', label: 'View', onSelect: () => navigate(`/contacts/${row.id}`) },
            { kind: 'item' as const, id: 'edit', label: 'Edit', onSelect: () => navigate(`/contacts/${row.id}/edit`) },
            archived
              ? { kind: 'unavailable' as const, id: 'restore', label: 'Restore', reason: 'Open the contact to restore it.' }
              : { kind: 'unavailable' as const, id: 'archive', label: 'Archive', reason: 'Open the contact to archive it.' },
          ];
          return <KebabMenu label={`Actions for ${row.name}`} entries={entries} />;
        },
      },
    ],
    [navigate],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string })
      : undefined;

  return (
    <section className="contacts-page" aria-label="Customers &amp; Suppliers">
      <PageHeader
        title="Customers &amp; Suppliers"
        description="Directory of customers and suppliers across all sample warehouses."
        secondaryActions={[
          <div className="contacts-page__toolbar" key="contacts-toolbar">
            <Input
              id="contact-search"
              label="Search"
              placeholder="Code, name or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="contact-role"
              label="Role"
              options={ROLES.map((value) => ({ value, label: value }))}
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
              placeholder="All roles"
            />
            <Select
              id="contact-status"
              label="Status"
              options={STATUSES.map((value) => ({ value, label: value }))}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              placeholder="All statuses"
            />
          </div>,
        ]}
        primaryAction={
          <Button variant="primary" onClick={() => navigate('/contacts/new')}>
            New Contact
          </Button>
        }
      />
      <SampleDataBanner moduleKey="contacts" />
      {isPending ? (
        <Card title="Contacts">
          <Skeleton label="Loading contacts" />
        </Card>
      ) : isError || data === undefined ? (
        <Card title="Contacts">
          <ErrorState
            message={error instanceof Error ? error.message : 'The contacts could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => {
              setPage(1);
            }}
          />
        </Card>
      ) : contacts.length === 0 ? (
        <EmptyState
          title="No contacts match your filters"
          description="Try adjusting the search, role or status filter to see contacts."
          actionLabel="Clear filters"
          onAction={() => {
            setSearch('');
            setRole('');
            setStatus('');
            setPage(1);
          }}
        />
      ) : (
        <Card title="Contacts">
          <DataTable
            columns={columns}
            data={contacts}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn="code"
            sortDirection="asc"
            onPageChange={setPage}
            emptyMessage="No contacts found."
          />
        </Card>
      )}
    </section>
  );
}
