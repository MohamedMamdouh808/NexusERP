import { useTranslation } from 'react-i18next';

import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PRODUCT_PERMISSIONS, PRODUCT_LIST_DEFAULTS } from '@nexuserp/shared';
import type { ProductSortField, ProductSortOrder, ProductStatusFilter } from '@nexuserp/shared';

import { PageHeader } from '../../components/shell/page-header';
import { formatMoneyLocalized } from '../../lib/i18n-format';
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
import { useCategories, useProducts, useUnits } from './use-products';
import type { Product } from '../../services/products-client';

/**
 * Shows a recorded price with the organization's currency.
 *
 * The value is shown exactly as it was stored - no conversion, never an
 * arithmetic step on money - with the organization's own ISO 4217 code beside
 * it, in the formatting the selected language uses (digit grouping adapts;
 * the currency does not).
 */
function withCurrency(amount: string, currencyCode: string | null): string {
  return currencyCode === null
    ? amount
    : formatMoneyLocalized(amount, currencyCode, 4);
}

/**
 * The product catalogue.
 *
 * The list is the organization's own: the search, the filters, the sorting and
 * the paging all happen on the server, because a browser cannot hold ten
 * thousand products. The status in force is visible, so the default is a rule
 * the reader can see rather than one they have to guess about.
 */
export function ProductsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = useSession();
  const { t } = useTranslation();
  const canWrite = hasPermission(session, PRODUCT_PERMISSIONS.write);

  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>(PRODUCT_LIST_DEFAULTS.status);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(PRODUCT_LIST_DEFAULTS.pageSize);
  const [sortBy, setSortBy] = useState<ProductSortField>(PRODUCT_LIST_DEFAULTS.sortBy);
  const [sortOrder, setSortOrder] = useState<ProductSortOrder>(PRODUCT_LIST_DEFAULTS.sortOrder);

  const { data, isPending, isError, error, refetch } = useProducts({
    search: search.trim() || undefined,
    categoryId: categoryId || undefined,
    status,
    page,
    pageSize,
    sortBy,
    sortOrder,
  });
  const categories = useCategories();
  const units = useUnits();
  const currencyCode = session.status === 'signed-in' ? session.organization.currencyCode : null;

  const products = data?.items ?? [];
  const total = data?.total ?? 0;

  function applySort(column: string, direction: 'asc' | 'desc') {
    if (column !== 'name' && column !== 'sku' && column !== 'createdAt') return;
    setSortBy(column as ProductSortField);
    setSortOrder(direction);
    setPage(1);
  }

  // The names are resolved before the columns are built, so the column list
  // does not depend on a function that changes on every render.
  const categoryNames = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category.name])),
    [categories.data],
  );
  const unitNames = useMemo(
    () => new Map((units.data ?? []).map((unit) => [unit.id, unit.name])),
    [units.data],
  );

  const columns: Column<Product>[] = useMemo(
    () => [
      { key: 'sku', header: t('products.list.columns.sku'), sortable: true },
      {
        key: 'name',
        header: t('products.list.columns.name'),
        sortable: true,
        render: (row) => <Link to={`/products/${row.id}`}>{row.name}</Link>,
      },
      { key: 'categoryId', header: t('products.list.columns.category'), render: (row) => categoryNames.get(row.categoryId) ?? '—' },
      { key: 'unitId', header: t('products.list.columns.unit'), render: (row) => unitNames.get(row.unitId) ?? '—' },
      { key: 'purchasePrice', header: t('products.list.columns.purchasePrice'), numeric: true, render: (row) => withCurrency(row.purchasePrice, currencyCode) },
      { key: 'sellingPrice', header: t('products.list.columns.sellingPrice'), numeric: true, render: (row) => withCurrency(row.sellingPrice, currencyCode) },
      {
        key: 'isArchived',
        header: t('products.list.columns.status'),
        render: (row) => (
          <Badge tone={row.isArchived ? 'destructive' : 'success'}>
            {row.isArchived ? t('common.status.archived') : t('common.status.active')}
          </Badge>
        ),
      },
      {
        key: 'actions',
        header: t('products.list.columns.actions'),
        render: (row) => {
          const entries = [
            {
              kind: 'item' as const,
              id: 'view',
              label: t('common.actions.view'),
              onSelect: () => navigate(`/products/${row.id}`),
            },
            ...(canWrite
              ? [
                  {
                    kind: 'item' as const,
                    id: 'edit',
                    label: t('common.actions.edit'),
                    onSelect: () => navigate(`/products/${row.id}/edit`),
                  },
                ]
              : []),
          ];
          return <KebabMenu label={t('products.list.actionsFor', { name: row.name })} entries={entries} />;
        },
      },
    ],
    [canWrite, navigate, categoryNames, unitNames, currencyCode, t],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string; status?: number })
      : undefined;

  return (
    <section className="products-page" aria-label={t('products.list.sectionAria')}>
      <PageHeader
        title={t('products.list.title')}
        description={t('products.list.description')}
        primaryAction={
          canWrite ? (
            <Button variant="primary" onClick={() => navigate('/products/new')}>
              {t('products.list.newProduct')}
            </Button>
          ) : undefined
        }
      />
      {/* The filters get their own row: inside the header they compete with the
          title and the action, and the action must stay readable. */}
      <div className="products-page__toolbar">
        <Input
          id="product-search"
          label={t('products.list.filters.search')}
          placeholder={t('products.list.filters.searchPlaceholder')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          id="product-category"
          label={t('products.list.filters.category')}
          options={(categories.data ?? []).map((category) => ({
            value: category.id,
            label: category.name,
          }))}
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setPage(1);
          }}
          placeholder={t('products.list.filters.allCategories')}
        />
        <Select
          id="product-status"
          label={t('products.list.filters.status')}
          options={[
            { value: 'active', label: t('common.status.active') },
            { value: 'archived', label: t('common.status.archived') },
            { value: 'all', label: t('products.list.filters.allStatuses') },
          ]}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ProductStatusFilter);
            setPage(1);
          }}
          placeholder={t('products.list.filters.allStatuses')}
        />
      </div>
      {isPending ? (
        <Card title={t('products.list.title')}>
          <Skeleton label={t('products.list.loading')} />
        </Card>
      ) : isError || data === undefined ? (
        <Card title={t('products.list.title')}>
          <ErrorState
            message={error instanceof Error ? error.message : t('products.list.loadError')}
            requestId={apiFailure?.requestId} status={apiFailure?.status}
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      ) : products.length === 0 ? (
        <EmptyState
          title={t('products.list.empty.title')}
          description={
            status === 'active'
              ? t('products.list.empty.descriptionActive')
              : t('products.list.empty.descriptionFiltered')
          }
          actionLabel={status === 'active' ? t('common.form.showArchived') : t('common.form.clearFilters')}
          onAction={() => {
            if (status === 'active') {
              setStatus('archived');
            } else {
              setSearch('');
              setCategoryId('');
              setStatus('active');
            }
            setPage(1);
          }}
        />
      ) : (
        <Card title={t('products.list.title')}>
          <DataTable
            columns={columns}
            data={products}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn={sortBy}
            sortDirection={sortOrder}
            onSortChange={applySort}
            onPageChange={setPage}
            emptyMessage={t('products.list.empty.tableMessage')}
            ariaLabel={t('products.list.sectionAria')}
          />
        </Card>
      )}
    </section>
  );
}
