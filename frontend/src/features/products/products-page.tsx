import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PRODUCT_PERMISSIONS, PRODUCT_LIST_DEFAULTS } from '@nexuserp/shared';
import type { ProductSortField, ProductSortOrder, ProductStatusFilter } from '@nexuserp/shared';

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
import { useCategories, useProducts, useUnits } from './use-products';
import type { Product } from '../../services/products-client';

/**
 * Shows a recorded amount with the organization's currency.
 *
 * The amount is shown exactly as it was stored: no conversion, and no
 * arithmetic on money. The currency code is the organization's own.
 */
function withCurrency(amount: string, currencyCode: string | null): string {
  return currencyCode === null ? amount : `${amount} ${currencyCode}`;
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
      { key: 'sku', header: 'SKU', sortable: true },
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        render: (row) => <Link to={`/products/${row.id}`}>{row.name}</Link>,
      },
      { key: 'categoryId', header: 'Category', render: (row) => categoryNames.get(row.categoryId) ?? '—' },
      { key: 'unitId', header: 'Unit', render: (row) => unitNames.get(row.unitId) ?? '—' },
      { key: 'purchasePrice', header: 'Purchase price', numeric: true, render: (row) => withCurrency(row.purchasePrice, currencyCode) },
      { key: 'sellingPrice', header: 'Selling price', numeric: true, render: (row) => withCurrency(row.sellingPrice, currencyCode) },
      {
        key: 'isArchived',
        header: 'Status',
        render: (row) => (
          <Badge tone={row.isArchived ? 'destructive' : 'success'}>
            {row.isArchived ? 'Archived' : 'Active'}
          </Badge>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (row) => {
          const entries = [
            {
              kind: 'item' as const,
              id: 'view',
              label: 'View',
              onSelect: () => navigate(`/products/${row.id}`),
            },
            ...(canWrite
              ? [
                  {
                    kind: 'item' as const,
                    id: 'edit',
                    label: 'Edit',
                    onSelect: () => navigate(`/products/${row.id}/edit`),
                  },
                ]
              : []),
          ];
          return <KebabMenu label={`Actions for ${row.name}`} entries={entries} />;
        },
      },
    ],
    [canWrite, navigate, categoryNames, unitNames, currencyCode],
  );

  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string })
      : undefined;

  return (
    <section className="products-page" aria-label="Products catalogue">
      <PageHeader
        title="Products"
        description="The organization's catalogue of customers' and suppliers' items."
        primaryAction={
          canWrite ? (
            <Button variant="primary" onClick={() => navigate('/products/new')}>
              New Product
            </Button>
          ) : undefined
        }
      />
      {/* The filters get their own row: inside the header they compete with the
          title and the action, and the action must stay readable. */}
      <div className="products-page__toolbar">
        <Input
          id="product-search"
          label="Search"
          placeholder="SKU or name"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          id="product-category"
          label="Category"
          options={(categories.data ?? []).map((category) => ({
            value: category.id,
            label: category.name,
          }))}
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setPage(1);
          }}
          placeholder="All categories"
        />
        <Select
          id="product-status"
          label="Status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
            { value: 'all', label: 'All statuses' },
          ]}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ProductStatusFilter);
            setPage(1);
          }}
          placeholder="All statuses"
        />
      </div>
      {isPending ? (
        <Card title="Products">
          <Skeleton label="Loading products" />
        </Card>
      ) : isError || data === undefined ? (
        <Card title="Products">
          <ErrorState
            message={error instanceof Error ? error.message : 'The products could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      ) : products.length === 0 ? (
        <EmptyState
          title="No products match your filters"
          description={
            status === 'active'
              ? 'Try another search, another category, or show the archived products.'
              : 'Try adjusting the search or the category filter.'
          }
          actionLabel={status === 'active' ? 'Show archived' : 'Clear filters'}
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
        <Card title="Products">
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
            emptyMessage="No products found."
            ariaLabel="Products catalogue"
          />
        </Card>
      )}
    </section>
  );
}
