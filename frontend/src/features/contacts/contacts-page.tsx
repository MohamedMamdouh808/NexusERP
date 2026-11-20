import { useTranslation } from 'react-i18next';

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

function roleLabel(contact: Contact, t: (key: string) => string): string {
  if (contact.isCustomer && contact.isSupplier) return t('contacts.list.filters.roleCustomerAndSupplier');
  if (contact.isCustomer) return t('contacts.list.filters.roleCustomer');
  return t('contacts.list.filters.roleSupplier');
}

export function ContactsPage() {
  const navigate = useNavigate();
  const session = useSession();
  const { t } = useTranslation();
  const canWrite = hasPermission(session, CONTACT_PERMISSIONS.write);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('all');
  const [status, setStatus] = useState<string>('active');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [sortBy, setSortBy] = useState<ContactSortField>('name');
  const [sortOrder, setSortOrder] = useState<ContactSortOrder>('asc');

  const { data, isPending, isError, error, refetch } = useContacts({
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

  const roleOptions = [
    { value: 'all', label: t('contacts.list.filters.allRoles') },
    { value: 'customer', label: t('contacts.list.filters.roleCustomer') },
    { value: 'supplier', label: t('contacts.list.filters.roleSupplier') },
  ];
  const statusOptions = [
    { value: 'active', label: t('common.status.active') },
    { value: 'archived', label: t('common.status.archived') },
    { value: 'all', label: t('contacts.list.filters.allStatuses') },
  ];

  const columns: Column<Contact>[] = useMemo(
    () => [
      { key: 'code', header: t('contacts.list.columns.code'), sortable: true },
      {
        key: 'name',
        header: t('contacts.list.columns.name'),
        sortable: true,
        render: (row) => <Link to={`/contacts/${row.id}`}>{row.name}</Link>,
      },
      {
        key: 'role',
        header: t('contacts.list.columns.role'),
        render: (row) => <Badge tone="info">{roleLabel(row, t)}</Badge>,
      },
      {
        key: 'status',
        header: t('contacts.list.columns.status'),
        render: (row) => (
          <Badge tone={row.isArchived ? 'destructive' : 'success'}>
            {row.isArchived ? t('common.status.archived') : t('common.status.active')}
          </Badge>
        ),
      },
      { key: 'email', header: t('contacts.list.columns.email'), render: (row) => row.email ?? '—' },
      {
        key: 'actions',
        header: t('contacts.list.columns.actions'),
        render: (row) => {
          const entries = [
            {
              kind: 'item' as const,
              id: 'view',
              label: t('common.actions.view'),
              onSelect: () => navigate(`/contacts/${row.id}`),
            },
            ...(canWrite
              ? [
                  {
                    kind: 'item' as const,
                    id: 'edit',
                    label: t('common.actions.edit'),
                    onSelect: () => navigate(`/contacts/${row.id}/edit`),
                  },
                ]
              : []),
          ];
          return <KebabMenu label={t('contacts.list.actionsFor', { name: row.name })} entries={entries} />;
        },
      },
    ],
    [canWrite, navigate, t],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string; status?: number })
      : undefined;

  return (
    <section className="contacts-page" aria-label={t('contacts.list.sectionAria')}>
      <PageHeader
        title={t('contacts.list.pageTitle')}
        description={t('contacts.list.description')}
        primaryAction={
          canWrite ? (
            <Button variant="primary" onClick={() => navigate('/contacts/new')}>
              {t('contacts.list.newContact')}
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
          label={t('contacts.list.filters.search')}
          placeholder={t('contacts.list.filters.searchPlaceholder')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          id="contact-role"
          label={t('contacts.list.filters.role')}
          options={roleOptions}
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}
          placeholder={t('contacts.list.filters.allRoles')}
        />
        <Select
          id="contact-status"
          label={t('contacts.list.filters.status')}
          options={statusOptions}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          placeholder={t('contacts.list.filters.allStatuses')}
        />
      </div>
      {isPending ? (
        <Card title={t('contacts.list.title')}>
          <Skeleton label={t('contacts.list.loading')} />
        </Card>
      ) : isError || data === undefined ? (
        <Card title={t('contacts.list.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('contacts.list.loadError')}
            requestId={apiFailure?.requestId} status={apiFailure?.status}
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      ) : contacts.length === 0 ? (
        <EmptyState
          title={t('contacts.list.empty.title')}
          description={t('contacts.list.empty.description')}
          actionLabel={t('contacts.list.empty.actionLabel')}
          onAction={() => {
            setSearch('');
            setRole('all');
            setStatus('active');
            setPage(1);
          }}
        />
      ) : (
        <Card title={t('contacts.list.title')}>
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
            emptyMessage={t('contacts.list.empty.tableMessage')}
            ariaLabel={t('contacts.list.sectionAria')}
          />
        </Card>
      )}
    </section>
  );
}
