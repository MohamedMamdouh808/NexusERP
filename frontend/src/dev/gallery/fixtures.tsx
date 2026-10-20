/**
 * Gallery fixtures (T055) - typed against the state manifest.
 *
 * Every component and state defined in `state-manifest.ts` must have a
 * corresponding fixture here. Missing any fixture is a TypeScript compile error.
 */

import type { ReactNode } from 'react';
import type { FixtureSlot } from './state-manifest';
import {
  Button,
  Input,
  Select,
  Textarea,
  Checkbox,
  Badge,
  Card,
  DataTable,
  Dialog,
  ConfirmDialog,
  DropdownMenu,
  Toast,
  Skeleton,
  EmptyState,
  ErrorState,
} from '../../components/ui';

export const FIXTURES: Record<FixtureSlot, () => ReactNode> = {
  // Button
  'Button.default': () => <Button>Default Button</Button>,
  'Button.hover': () => <Button>Hover Button</Button>,
  'Button.focus-visible': () => <Button>Focus Visible</Button>,
  'Button.active': () => <Button>Active Button</Button>,
  'Button.loading': () => <Button loading>Loading Button</Button>,
  'Button.disabled': () => <Button disabled>Disabled Button</Button>,

  // Input
  'Input.default': () => <Input id="in-def" label="Customer Name" />,
  'Input.focus-visible': () => <Input id="in-foc" label="Focused Input" />,
  'Input.filled': () => <Input id="in-fil" label="Filled Input" defaultValue="Acme Corp" />,
  'Input.required': () => <Input id="in-req" label="Required Email" required />,
  'Input.with-help-text': () => (
    <Input id="in-hlp" label="Tax Code" helpText="9-digit national tax identifier" />
  ),
  'Input.invalid': () => (
    <Input id="in-inv" label="Postal Code" error="Invalid format for country" defaultValue="BAD-ZIP" />
  ),
  'Input.disabled': () => <Input id="in-dis" label="Locked Field" disabled defaultValue="Fixed value" />,

  // Select
  'Select.default': () => (
    <Select
      id="sel-def"
      label="Currency"
      placeholder="Choose currency"
      options={[
        { value: 'USD', label: 'USD ($)' },
        { value: 'EUR', label: 'EUR (€)' },
      ]}
    />
  ),
  'Select.focus-visible': () => (
    <Select
      id="sel-foc"
      label="Focused Select"
      options={[{ value: '1', label: 'Option 1' }]}
    />
  ),
  'Select.selected-value': () => (
    <Select
      id="sel-val"
      label="Currency"
      defaultValue="USD"
      options={[
        { value: 'USD', label: 'USD ($)' },
        { value: 'EUR', label: 'EUR (€)' },
      ]}
    />
  ),
  'Select.required': () => (
    <Select
      id="sel-req"
      label="Warehouse"
      required
      options={[{ value: 'main', label: 'Main Warehouse' }]}
    />
  ),
  'Select.with-help-text': () => (
    <Select
      id="sel-hlp"
      label="Payment Terms"
      helpText="Governs invoice due dates"
      options={[{ value: '30', label: 'Net 30' }]}
    />
  ),
  'Select.invalid': () => (
    <Select
      id="sel-inv"
      label="Shipping Carrier"
      error="Carrier not available in region"
      options={[{ value: 'dhl', label: 'DHL' }]}
    />
  ),
  'Select.disabled': () => (
    <Select
      id="sel-dis"
      label="Fiscal Regime"
      disabled
      defaultValue="standard"
      options={[{ value: 'standard', label: 'Standard Regime' }]}
    />
  ),

  // Textarea
  'Textarea.default': () => <Textarea id="tx-def" label="Delivery Instructions" />,
  'Textarea.focus-visible': () => <Textarea id="tx-foc" label="Focused Note" />,
  'Textarea.filled': () => (
    <Textarea id="tx-fil" label="Internal Notes" defaultValue="Fragile goods. Handle with care." />
  ),
  'Textarea.required': () => <Textarea id="tx-req" label="Cancellation Reason" required />,
  'Textarea.with-help-text': () => (
    <Textarea id="tx-hlp" label="Dispatch Memo" helpText="Printed on packing slip" />
  ),
  'Textarea.invalid': () => (
    <Textarea id="tx-inv" label="Memo" error="Message exceeds 500 characters" />
  ),
  'Textarea.disabled': () => <Textarea id="tx-dis" label="Archived Terms" disabled defaultValue="Immutable terms" />,

  // Checkbox
  'Checkbox.unchecked': () => <Checkbox id="cb-unc" label="Email delivery receipt" />,
  'Checkbox.checked': () => <Checkbox id="cb-chk" label="Apply wholesale discount" defaultChecked />,
  'Checkbox.focus-visible': () => <Checkbox id="cb-foc" label="Focused Checkbox" />,
  'Checkbox.required': () => <Checkbox id="cb-req" label="Confirm legal consent" required />,
  'Checkbox.invalid': () => (
    <Checkbox id="cb-inv" label="Terms agreement" error="You must accept terms to proceed" />
  ),
  'Checkbox.disabled': () => <Checkbox id="cb-dis" label="Auto-renew contract" disabled defaultChecked />,

  // Badge (All 14 statuses + conveys-more-than-colour)
  'Badge.DRAFT': () => <Badge status="DRAFT" />,
  'Badge.CONFIRMED': () => <Badge status="CONFIRMED" />,
  'Badge.ISSUED': () => <Badge status="ISSUED" />,
  'Badge.PARTIALLY_RECEIVED': () => <Badge status="PARTIALLY_RECEIVED" />,
  'Badge.PARTIALLY_SHIPPED': () => <Badge status="PARTIALLY_SHIPPED" />,
  'Badge.PARTIALLY_PAID': () => <Badge status="PARTIALLY_PAID" />,
  'Badge.RECEIVED': () => <Badge status="RECEIVED" />,
  'Badge.SHIPPED': () => <Badge status="SHIPPED" />,
  'Badge.PAID': () => <Badge status="PAID" />,
  'Badge.CANCELLED': () => <Badge status="CANCELLED" />,
  'Badge.VOID': () => <Badge status="VOID" />,
  'Badge.ACTIVE': () => <Badge status="ACTIVE" />,
  'Badge.CONSUMED': () => <Badge status="CONSUMED" />,
  'Badge.RELEASED': () => <Badge status="RELEASED" />,
  'Badge.conveys-more-than-colour': () => <Badge status="CONFIRMED" />,

  // Card
  'Card.title-only': () => <Card title="Quarterly Sales Target">Metric details</Card>,
  'Card.with-description': () => (
    <Card title="Storage Utilization" description="Warehouse zone B - 82% occupied">
      Bar chart placeholder
    </Card>
  ),
  'Card.with-actions': () => (
    <Card
      title="Active Customers"
      actions={
        <Button variant="secondary" onClick={() => {}}>
          Export
        </Button>
      }
    >
      Customer listing
    </Card>
  ),

  // DataTable
  'DataTable.default': () => (
    <DataTable
      columns={[
        { key: 'sku', header: 'SKU', sortable: true },
        { key: 'name', header: 'Item Name' },
        { key: 'price', header: 'Unit Price', numeric: true },
      ]}
      data={[
        { id: '1', sku: 'SKU-001', name: 'Industrial Drill', price: '249.99' },
        { id: '2', sku: 'SKU-002', name: 'Drill Bit Set', price: '34.50' },
      ]}
      total={2}
      page={1}
      pageSize={10}
      onPageChange={() => {}}
    />
  ),
  'DataTable.loading': () => (
    <DataTable
      columns={[
        { key: 'sku', header: 'SKU' },
        { key: 'name', header: 'Item Name' },
      ]}
      data={[]}
      loading
      total={0}
      page={1}
      pageSize={10}
      onPageChange={() => {}}
    />
  ),
  'DataTable.empty': () => (
    <DataTable
      columns={[
        { key: 'sku', header: 'SKU' },
        { key: 'name', header: 'Item Name' },
      ]}
      data={[]}
      total={0}
      page={1}
      pageSize={10}
      onPageChange={() => {}}
      emptyMessage="No catalog items in this category"
    />
  ),
  'DataTable.sorted-ascending': () => (
    <DataTable
      columns={[
        { key: 'sku', header: 'SKU', sortable: true },
        { key: 'name', header: 'Item Name' },
      ]}
      data={[{ id: '1', sku: 'A-100', name: 'First' }]}
      sortColumn="sku"
      sortDirection="asc"
      total={1}
      page={1}
      pageSize={10}
      onPageChange={() => {}}
    />
  ),
  'DataTable.sorted-descending': () => (
    <DataTable
      columns={[
        { key: 'sku', header: 'SKU', sortable: true },
        { key: 'name', header: 'Item Name' },
      ]}
      data={[{ id: '1', sku: 'Z-999', name: 'Last' }]}
      sortColumn="sku"
      sortDirection="desc"
      total={1}
      page={1}
      pageSize={10}
      onPageChange={() => {}}
    />
  ),
  'DataTable.page-after-the-first': () => (
    <DataTable
      columns={[{ key: 'name', header: 'Customer' }]}
      data={[{ id: '21', name: 'Global Tech Corp' }]}
      total={85}
      page={3}
      pageSize={10}
      onPageChange={() => {}}
    />
  ),

  // Dialog
  'Dialog.closed': () => <Dialog open={false} onClose={() => {}} title="Closed Dialog">Content</Dialog>,
  'Dialog.open': () => (
    <Dialog open={true} onClose={() => {}} title="Supplier Agreement">
      Terms and conditions review.
    </Dialog>
  ),

  // ConfirmDialog
  'ConfirmDialog.open-non-destructive': () => (
    <ConfirmDialog
      open={true}
      onClose={() => {}}
      onConfirm={() => {}}
      title="Archive Vendor"
      description="The vendor will be marked archived."
      actionLabel="Archive Vendor"
    />
  ),
  'ConfirmDialog.open-destructive': () => (
    <ConfirmDialog
      open={true}
      destructive
      onClose={() => {}}
      onConfirm={() => {}}
      title="Delete Invoice Draft"
      description="This draft invoice will be permanently removed."
      actionLabel="Delete Draft"
    />
  ),
  'ConfirmDialog.confirming': () => (
    <ConfirmDialog
      open={true}
      loading
      onClose={() => {}}
      onConfirm={() => {}}
      title="Saving Changes"
      description="Persisting modifications to batch record."
      actionLabel="Saving..."
    />
  ),

  // DropdownMenu
  'DropdownMenu.closed': () => (
    <DropdownMenu
      trigger="Actions"
      label="Row Actions"
      entries={[{ kind: 'item', id: '1', label: 'View', onSelect: () => {} }]}
    />
  ),
  'DropdownMenu.open': () => (
    <DropdownMenu
      trigger="Actions"
      label="Row Actions"
      entries={[
        { kind: 'item', id: '1', label: 'Duplicate', onSelect: () => {} },
        { kind: 'item', id: '2', label: 'Export PDF', onSelect: () => {} },
      ]}
    />
  ),
  'DropdownMenu.entry-unavailable': () => (
    <DropdownMenu
      trigger="Manage"
      label="Entity Management"
      entries={[
        { kind: 'item', id: '1', label: 'Rename', onSelect: () => {} },
        {
          kind: 'unavailable',
          id: '2',
          label: 'Delete Organization',
          reason: 'Master admin permission required',
        },
      ]}
    />
  ),

  // Toast
  'Toast.success': () => (
    <Toast id="t-suc" tone="success" message="Sales Order SO-1002 saved" onDismiss={() => {}} />
  ),
  'Toast.failure': () => (
    <Toast id="t-fail" tone="failure" message="Network timeout connecting to printer" onDismiss={() => {}} />
  ),
  'Toast.informational': () => (
    <Toast id="t-info" tone="informational" message="Background sync complete" onDismiss={() => {}} />
  ),
  'Toast.dismissed': () => <div data-testid="toast-dismissed-slot" />,

  // Skeleton
  'Skeleton.default': () => <Skeleton label="Loading order history" />,
  'Skeleton.reduced-motion': () => <Skeleton label="Loading order history" reducedMotion />,

  // EmptyState
  'EmptyState.with-create-action': () => (
    <EmptyState
      title="No Purchase Orders"
      description="Create your first PO to initiate stock acquisition."
      actionLabel="Create Purchase Order"
      onAction={() => {}}
    />
  ),
  'EmptyState.without-create-action': () => (
    <EmptyState
      title="No Search Results"
      description="No catalog items matched your query filters."
    />
  ),

  // ErrorState
  'ErrorState.retryable': () => (
    <ErrorState
      message="Database connection pool timeout"
      requestId="req_876231a"
      onRetry={() => {}}
    />
  ),
  'ErrorState.not-retryable': () => (
    <ErrorState
      message="Requested resource does not exist"
      requestId="req_998124b"
    />
  ),
};
