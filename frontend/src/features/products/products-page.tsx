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
import { formatMoney } from '../../lib/format';
import { useProducts } from './use-products';

const CATEGORIES = ['Packaging', 'Storage', 'Equipment', 'PPE', 'Services', 'General'] as const;

const STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;

function statusTone(status: string): 'success' | 'warning' | 'info' | 'neutral' | 'destructive' {
  if (status === 'ARCHIVED' || status === 'CANCELLED') return 'destructive';
  if (status === 'ACTIVE') return 'success';
  if (status === 'DRAFT') return 'neutral';
  return 'warning';
}

export function ProductsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const { data, isPending, isError, error } = useProducts({
    search,
    category: category || undefined,
    status: (status as 'DRAFT' | 'ACTIVE' | 'ARCHIVED') || undefined,
    page,
    pageSize,
    sort: 'sku',
    direction: 'asc',
  });

  const products = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Column<{ id: string; sku: string; name: string; category: string; unitOfMeasure: string; purchasePrice: string; sellingPrice: string; status: string }>[] = useMemo(
    () => [
      { key: 'sku', header: 'SKU' },
      { key: 'name', header: 'Name' },
      { key: 'category', header: 'Category' },
      { key: 'unitOfMeasure', header: 'Unit' },
      {
        key: 'purchasePrice',
        header: 'Purchase price',
        numeric: true,
        render: (row) => formatMoney(row.purchasePrice),
      },
      {
        key: 'sellingPrice',
        header: 'Selling price',
        numeric: true,
        render: (row) => formatMoney(row.sellingPrice),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (row) => {
          const archived = row.status === 'ARCHIVED';
          const entries = [
            { kind: 'item' as const, id: 'view', label: 'View', onSelect: () => navigate(`/products/${row.id}`) },
            { kind: 'item' as const, id: 'edit', label: 'Edit', onSelect: () => navigate(`/products/${row.id}/edit`) },
            archived
              ? { kind: 'unavailable' as const, id: 'restore', label: 'Restore', reason: 'Use Restore on the product detail page.' }
              : { kind: 'unavailable' as const, id: 'archive', label: 'Archive', reason: 'Open the product to archive it.' },
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
    <section className="products-page" aria-label="Products catalogue">
      <PageHeader
        title="Products"
        description="Product catalogue with unit prices and stock levels."
        secondaryActions={[
          <div className="products-page__toolbar" key="products-toolbar">
            <Input
              id="product-search"
              label="Search"
              placeholder="SKU, name or category"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              id="product-category"
              label="Category"
              options={CATEGORIES.map((value) => ({ value, label: value }))}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              placeholder="All categories"
            />
            <Select
              id="product-status"
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
          <Button variant="primary" onClick={() => navigate('/products/new')}>
            New Product
          </Button>
        }
      />
      <SampleDataBanner moduleKey="products" />
      {isPending ? (
        <Card>
          <Skeleton label="Loading products" />
        </Card>
      ) : isError || data === undefined ? (
        <Card>
          <ErrorState
            message={error instanceof Error ? error.message : 'The products could not be loaded.'}
            requestId={apiFailure?.requestId}
            onRetry={() => {
              setPage(1);
            }}
          />
        </Card>
      ) : products.length === 0 ? (
        <EmptyState
          title="No products match your filters"
          description="Try adjusting the search, category or status filter to see products."
          actionLabel="Clear filters"
          onAction={() => {
            setSearch('');
            setCategory('');
            setStatus('');
            setPage(1);
          }}
        />
      ) : (
        <Card>
          <DataTable
            columns={columns}
            data={products}
            total={total}
            page={page}
            pageSize={pageSize}
            sortColumn="sku"
            sortDirection="asc"
            onPageChange={setPage}
            emptyMessage="No products found."
          />
        </Card>
      )}
    </section>
  );
}
