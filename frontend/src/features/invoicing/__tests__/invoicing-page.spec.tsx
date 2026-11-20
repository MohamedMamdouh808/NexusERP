import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvoicingPage } from '../invoicing-page';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { seedSignedInSession } from '../../../test/session';

/**
 * US5 (T064/T065): the invoice list is real data.
 *
 * The figures are the SERVER's figures for the whole filtered selection, not a
 * total of the rows on the page and not a second unfiltered read. The create
 * dialog offers only shipped orders that have no non-void invoice yet.
 *
 * The service is stubbed at the seam the client uses; the payloads are the
 * service's own page shapes.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const LABEL = 'Operational invoice - not a tax invoice';

const INVOICE_ROWS = [
  {
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
    label: LABEL,
  },
  {
    id: 'inv-2',
    number: 'INV-000002',
    orderId: 'so-2',
    orderNumber: 'SO-000002',
    customerId: 'cust-2',
    customerName: 'Bluebird Traders',
    status: 'PARTIALLY_PAID',
    issueDate: '2026-10-01',
    dueDate: '2026-10-15',
    total: '500.00',
    balance: '250.00',
    isOverdue: true,
    version: 3,
    label: LABEL,
  },
] as const;

const SHIPPED_ORDERS = [
  {
    id: 'so-1',
    number: 'SO-000001',
    customerId: 'cust-1',
    customerName: 'Acme Retail',
    warehouseId: 'w-1',
    warehouseName: 'Main Warehouse',
    status: 'SHIPPED',
    orderDate: '2026-10-20',
    total: '1000.00',
    version: 4,
  },
  {
    id: 'so-2',
    number: 'SO-000002',
    customerId: 'cust-2',
    customerName: 'Bluebird Traders',
    warehouseId: 'w-1',
    warehouseName: 'Main Warehouse',
    status: 'SHIPPED',
    orderDate: '2026-10-21',
    total: '500.00',
    version: 2,
  },
] as const;

interface StubLog {
  readonly urls: string[];
}

function stubInvoicingApi(): StubLog {
  const urls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith('/api/v1/invoices')) {
      // The create dialog's invoiced-order scan asks for whole pages. SO-000001
      // already has a non-void invoice, so it must not be offered again.
      if (url.includes('pageSize=100')) {
        const page = Number(new URL(url, 'http://localhost').searchParams.get('page'));
        return jsonResponse({
          items: page === 1 ? [INVOICE_ROWS[0]] : [],
          total: 1,
          page,
          pageSize: 100,
          outstanding: '0.00',
          overdue: '0.00',
        });
      }
      if (url.includes('status=ISSUED')) {
        return jsonResponse({
          items: [INVOICE_ROWS[0]],
          total: 1,
          page: 1,
          pageSize: 10,
          outstanding: '1000.00',
          overdue: '0.00',
        });
      }
      return jsonResponse({
        items: INVOICE_ROWS,
        total: 2,
        page: 1,
        pageSize: 10,
        outstanding: '1250.00',
        overdue: '250.00',
      });
    }
    if (url.startsWith('/api/v1/sales-orders')) {
      return jsonResponse({ items: SHIPPED_ORDERS, total: SHIPPED_ORDERS.length });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { urls };
}

describe('invoicing page (US5)', () => {
  it('T064: renders real invoices with no sample-data banner', async () => {
    seedSignedInSession();
    const log = stubInvoicingApi();
    renderWithProviders(<InvoicingPage />, { initialEntries: ['/invoicing'] });

    expect(await screen.findByText('Acme Retail')).toBeInTheDocument();
    expect(screen.getByText('Bluebird Traders')).toBeInTheDocument();
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
    expect(log.urls.some((url) => url.startsWith('/api/v1/invoices'))).toBe(true);
  });

  it('T065: shows the whole-selection figures and restates the filters', async () => {
    seedSignedInSession();
    stubInvoicingApi();
    renderWithProviders(<InvoicingPage />, { initialEntries: ['/invoicing'] });

    const outstanding = await screen.findByText('Outstanding in this selection');
    expect(outstanding.parentElement).toHaveTextContent('USD 1,250.00');
    const overdue = screen.getByText('Overdue in this selection');
    expect(overdue.parentElement).toHaveTextContent('USD 250.00');
    // No filter note while the selection is unfiltered.
    expect(screen.queryByText(/Figures cover this filtered selection/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ISSUED' } });

    await waitFor(() =>
      expect(screen.getByText(/Figures cover this filtered selection/)).toHaveTextContent(
        'Status: ISSUED',
      ),
    );
    expect(screen.getByText('Outstanding in this selection').parentElement).toHaveTextContent(
      'USD 1,000.00',
    );
    expect(screen.getByText('Overdue in this selection').parentElement).toHaveTextContent(
      'USD 0.00',
    );
  });

  it('T065: the create dialog lists only shipped orders without a non-void invoice', async () => {
    seedSignedInSession();
    stubInvoicingApi();
    renderWithProviders(<InvoicingPage />, { initialEntries: ['/invoicing'] });

    const create = await screen.findByRole('button', { name: 'Create Invoice' });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('SO-000002')).toBeInTheDocument();
    expect(within(dialog).queryByText('SO-000001')).not.toBeInTheDocument();
  });
});
