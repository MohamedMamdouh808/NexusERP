import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OrderDetailPage } from '../order-detail-page';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { seedSignedInSession } from '../../../test/session';

/**
 * US5 (T069): the sales order detail's next step.
 *
 * A SHIPPED order offers "Create Invoice"; when the order already has a
 * non-void invoice the action links to that invoice instead of offering a
 * second one.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const ORDER = {
  id: 'so-1',
  number: 'SO-000001',
  customerId: 'cust-1',
  customerName: 'Acme Retail',
  warehouseId: 'w-1',
  warehouseName: 'Main Warehouse',
  status: 'SHIPPED',
  orderDate: '2026-10-20',
  notes: '',
  lines: [],
  total: '1000.00',
  version: 4,
  shipments: [],
};

const INVOICE = {
  id: 'inv-1',
  number: 'INV-000001',
  orderId: 'so-1',
  orderNumber: 'SO-000001',
  customerId: 'cust-1',
  customerName: 'Acme Retail',
  status: 'ISSUED',
  issueDate: '2026-11-01',
  dueDate: '2026-12-01',
  total: '1000.00',
  balance: '1000.00',
  isOverdue: false,
  version: 2,
  label: 'Operational invoice - not a tax invoice',
};

function stubOrderApi(existingInvoice: boolean) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === '/api/v1/sales-orders/so-1') return jsonResponse(ORDER);
    if (url === '/api/v1/sales-orders/so-1/invoices' && init?.method === 'POST') {
      return jsonResponse({
        id: 'inv-1',
        number: null,
        status: 'DRAFT',
        label: 'Operational invoice - not a tax invoice',
      });
    }
    if (url.startsWith('/api/v1/invoices?')) {
      return jsonResponse({
        items: existingInvoice ? [INVOICE] : [],
        total: existingInvoice ? 1 : 0,
        page: 1,
        pageSize: 100,
        outstanding: '0.00',
        overdue: '0.00',
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

function renderOrder() {
  renderWithProviders(
    <Routes>
      <Route path="/sales/:id" element={<OrderDetailPage />} />
    </Routes>,
    { initialEntries: ['/sales/so-1'] },
  );
}

describe('sales order detail invoicing (US5)', () => {
  it('T069: links to the invoice when the shipped order already has one', async () => {
    seedSignedInSession();
    stubOrderApi(true);
    renderOrder();

    const link = await screen.findByRole('link', { name: 'View invoice INV-000001' });
    expect(link).toHaveAttribute('href', '/invoicing/inv-1');
    expect(screen.queryByRole('button', { name: 'Create Invoice' })).not.toBeInTheDocument();
  });

  it('T069: creates the draft from an enabled "Create Invoice" when none exists', async () => {
    seedSignedInSession();
    const log = stubOrderApi(false);
    renderOrder();

    const create = await screen.findByRole('button', { name: 'Create Invoice' });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);

    await waitFor(() =>
      expect(log.calls.some((url) => url === '/api/v1/sales-orders/so-1/invoices')).toBe(true),
    );
  });
});
