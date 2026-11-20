import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvoicingPage } from '../invoicing-page';
import { PaymentDetailPage } from '../payment-detail-page';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { seedSignedInSession } from '../../../test/session';
import { INVOICING_PERMISSIONS, PAYMENT_PERMISSIONS } from '@nexuserp/shared';

/**
 * US5 (T068): the Payments list and permission-aware actions.
 *
 * A reversed payment is marked "Reversed on <date>" in TEXT as well as colour,
 * so the state survives a monochrome print or a colour-blind reader. The
 * derived-status and method filters combine in one request, and actions the
 * member lacks are absent from what GET /auth/me reported.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const PAYMENTS = [
  {
    id: 'pay-1',
    number: 'PAY-000001',
    customerId: 'cust-1',
    customerName: 'Acme Retail',
    amount: '100.00',
    paymentDate: '2026-11-10',
    method: 'BANK_TRANSFER',
    reference: null,
    status: 'RECORDED',
    reversedAt: null,
    recordedAt: '2026-11-10T09:00:00.000Z',
  },
  {
    id: 'pay-2',
    number: 'PAY-000002',
    customerId: 'cust-2',
    customerName: 'Bluebird Traders',
    amount: '60.00',
    paymentDate: '2026-11-12',
    method: 'CASH',
    reference: 'Duplicate',
    status: 'REVERSED',
    reversedAt: '2026-11-13T10:30:00.000Z',
    recordedAt: '2026-11-12T09:00:00.000Z',
  },
] as const;

const PAYMENT_DETAIL = {
  ...PAYMENTS[0],
  allocations: [],
  reversal: null,
  recordedBy: 'user-1',
};

function stubPaymentsApi() {
  const urls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url === '/api/v1/payments/pay-1') return jsonResponse(PAYMENT_DETAIL);
    if (url.startsWith('/api/v1/payments')) {
      return jsonResponse({ items: PAYMENTS, total: PAYMENTS.length, page: 1, pageSize: 10 });
    }
    if (url.startsWith('/api/v1/sales-orders')) {
      return jsonResponse({ items: [], total: 0 });
    }
    if (url.startsWith('/api/v1/invoices')) {
      return jsonResponse({
        items: [],
        total: 0,
        page: 1,
        pageSize: 100,
        outstanding: '0.00',
        overdue: '0.00',
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { urls };
}

describe('payments list (US5)', () => {
  it('T068: marks a reversed payment "Reversed on <date>" as text', async () => {
    seedSignedInSession();
    stubPaymentsApi();
    renderWithProviders(<InvoicingPage />, { initialEntries: ['/invoicing/payments'] });

    expect(await screen.findByText('Reversed on 2026-11-13')).toBeInTheDocument();
    expect(screen.getByText('Bluebird Traders')).toBeInTheDocument();
  });

  it('T068: combines the derived-status and method filters in one request', async () => {
    seedSignedInSession();
    const log = stubPaymentsApi();
    renderWithProviders(<InvoicingPage />, { initialEntries: ['/invoicing/payments'] });
    await screen.findByText('Reversed on 2026-11-13');

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'reversed' } });
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'CASH' } });

    await waitFor(() => {
      const combined = log.urls.find(
        (url) =>
          url.startsWith('/api/v1/payments?') &&
          url.includes('status=reversed') &&
          url.includes('method=CASH'),
      );
      expect(combined).toBeDefined();
    });
  });

  it('T068: the Reverse action is absent without payments.reverse', async () => {
    seedSignedInSession({ permissions: [PAYMENT_PERMISSIONS.read] });
    stubPaymentsApi();
    renderWithProviders(
      <Routes>
        <Route path="/invoicing/payments/:id" element={<PaymentDetailPage />} />
      </Routes>,
      { initialEntries: ['/invoicing/payments/pay-1'] },
    );

    expect(await screen.findByText('PAY-000001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reverse payment' })).not.toBeInTheDocument();
  });

  it('T068: Create Invoice is disabled without invoices.write', async () => {
    seedSignedInSession({ permissions: [INVOICING_PERMISSIONS.read] });
    stubPaymentsApi();
    renderWithProviders(<InvoicingPage />, { initialEntries: ['/invoicing'] });

    const create = await screen.findByRole('button', { name: 'Create Invoice' });
    expect(create).toBeDisabled();
  });
});
