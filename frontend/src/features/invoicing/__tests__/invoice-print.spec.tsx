import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvoiceDetailPage } from '../invoice-detail-page';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { seedSignedInSession } from '../../../test/session';

/**
 * US5 (T069): Print shows only the invoice and the label.
 *
 * The browser print is driven by the print stylesheet: the shell and the
 * action row are hidden, and the `.print-only` header carries the document
 * label. This test asserts the markup that the stylesheet depends on - the
 * exact label inside the print-only region and the action row outside it.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const LABEL = 'Operational invoice - not a tax invoice';

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
  lines: [
    {
      id: 'line-1',
      productId: 'prod-1',
      productSku: 'SKU-001',
      productName: 'Steel Bolt',
      quantity: '10.000',
      unitPrice: '100.0000',
      lineTotal: '1000.00',
    },
  ],
  total: '1000.00',
  paid: '0.00',
  balance: '1000.00',
  isOverdue: false,
  voidReason: null,
  voidedAt: null,
  voidedBy: null,
  version: 2,
  label: LABEL,
  paymentsApplied: [],
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
};

describe('invoice print (US5)', () => {
  it('T069: the print-only region carries the exact label and no actions', async () => {
    seedSignedInSession();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/v1/invoices/inv-1') return jsonResponse(INVOICE);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/invoicing/:id" element={<InvoiceDetailPage />} />
      </Routes>,
      { initialEntries: ['/invoicing/inv-1'] },
    );

    expect(await screen.findByText('INV-000001')).toBeInTheDocument();

    const printOnly = container.querySelector('.print-only');
    expect(printOnly).not.toBeNull();
    expect(printOnly).toHaveTextContent('NexusERP · Operational invoice');
    expect(printOnly).toHaveTextContent(LABEL);
    expect(within(printOnly as HTMLElement).queryByRole('button')).not.toBeInTheDocument();

    // The action row is inside the region the print stylesheet hides.
    expect(screen.getByRole('button', { name: 'Print' }).closest('.invoice-header-actions')).not.toBeNull();
  });
});
