import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CONTACT_PERMISSIONS, type ContactSortField, type ContactSortOrder } from '@nexuserp/shared';

import { PageHeader } from '../../components/shell/page-header';
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
import { hasPermission, useSession } from '../../services/auth-session';
import { useContacts } from './use-contacts';
import type { Contact } from '../../services/contacts-client';

const ROLE_OPTIONS = [
  { value: 'all', label: 'All roles' },
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
];
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All statuses' },
];

function roleLabel(contact: Contact): string {
  if (contact.isCustomer && contact.isSupplier) return 'Customer & Supplier';
  if (contact.isCustomer) return 'Customer';
  return 'Supplier';
}

export function ContactsPage() {
  const navigate = useNavigate();
  const session = useSession();
  const canWrite = hasPermission(session, CONTACT_PERMISSIONS.write);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('all');
  const [status, setStatus] = useState<string>('active');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [sortBy, setSortBy] = useState<ContactSortField>('name');
  const [sortOrder, setSortOrder] = useState<ContactSortOrder>('asc');

  const { data, isPending, isError, error } = useContacts({
    search: search.trim() || undefined,
    role: role as 'all' | 'customer' | 'supplier',
    status: status as 'all' | 'active' | 'archived',
    page,
    pageSize,
    sortBy,
    sortOrder,
  });

  const contacts = data?.items ?? [];
  const total = data?.total ?? 0;

  function applySort(column: string, direction: 'asc' | 'desc') {
    if (column !== 'name' && column !== 'code' && column !== 'createdAt') return;
    setSortBy(column as ContactSortField);
    setSortOrder(direction);
    setPage(1);
  }

  const columns: Column<Contact>[] = useMemo(
    () => [
      { key: 'code', header: 'Code', sortable: true },
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        render: (row) => <Link to={`/contacts/${row.id}`}>{row.name}</Link>,
      },
      { key: 'role', header: 'Role', render: (row) => <Badge tone="info">{roleLabel(row)}</Badge> },
      {
        key: 'status',
        header: 'Status',
        render: (row) => (
          <Badge tone={row.isArchived ? 'destructive' : 'success'}>
            {row.isArchived ? 'Archived' : 'Active'}
          </Badge>
        ),
      },
      { key: 'email', header: 'Email', render: (row) => row.email ?? '—' },
      {
        key: 'actions',
        header: 'Actions',
        render: (row) => {
          const entries = [
            {
              kind: 'item' as const,
              id: 'view',
              label: 'View',
              onSelect: () => navigate(`/contacts/${row.id}`),
            },
            ...(canWrite
              ? [
                  {
                    kind: 'item' as const,
                    id: 'edit',
                    label: 'Edit',
                    onSelect: () => navigate(`/contacts/${row.id}/edit`),
                  },
                ]
              : []),
          ];
          return <KebabMenu label={`Actions for ${row.name}`} entries={entries} />;
        },
      },
    ],
    [canWrite, navigate],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string })
      : undefined;

  return (
    <section className="contacts-page" aria-label="Customers &amp; Suppliers">
      <PageHeader
        title="Customers &amp; Suppliers"
        description="Directory of customers and suppliers."
        primaryAction={
          canWrite ? (
            <Button variant="primary" onClick={() => navigate('/contacts/new')}>
              New Contact
            </Button>
          ) : undefined
        }
      />
      {/* The filters get their own row: inside the header they compete with the
          title and the action, and the action is the one that must stay
          readable. */}
      <div className="contacts-page__toolbar">
        <Input
          id="contact-search"
          label="Search"
          placeholder="Code, name, email"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          id="contact-role"
          label="Role"
          options={ROLE_OPTIONS}
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
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          placeholder="All statuses"
        />
      </div>
      {isPending ? (
        <Card title="Contacts">
          <Skeleton label="Loading contacts" />
        </Card>
      ) : isError || data === undefined ? (
        <Card title="Contacts">
          <ErrorState
            message={error instanceof Error ? error.message : 'The contacts could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => setPage(1)}
          />
        </Card>
      ) : contacts.length === 0 ? (
        <EmptyState
          title="No contacts match your filters"
          description="Try adjusting the search, role or status filter to see contacts."
          actionLabel="Clear filters"
          onAction={() => {
            setSearch('');
            setRole('all');
            setStatus('active');
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
            sortColumn={sortBy}
            sortDirection={sortOrder}
            onSortChange={applySort}
            onPageChange={setPage}
            emptyMessage="No contacts found."
          />
        </Card>
      )}
    </section>
  );
}
