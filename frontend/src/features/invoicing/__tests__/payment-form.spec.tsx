import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PaymentFormPage } from '../payment-form-page';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { seedSignedInSession } from '../../../test/session';
import { INVOICING_PERMISSIONS, PAYMENT_PERMISSIONS } from '@nexuserp/shared';

/**
 * US5 (T067): the Record-payment screen.
 *
 * The screen needs BOTH `payments.record` and `invoices.read`: it cannot offer
 * an allocation without reading the invoice balances. A refusal the service
 * sends is shown inline with the request identifier, and a balance refusal
 * names the invoice and its current balance. The server remains the authority:
 * a direct call without permission is still refused.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const CUSTOMER = {
  id: 'cust-1',
  organizationId: 'org-1',
  code: 'CUS-0001',
  name: 'Acme Retail',
  email: null,
  phone: null,
  isCustomer: true,
  isSupplier: false,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
  isArchived: false,
  version: 1,
};

const OPEN_INVOICE = {
  id: 'inv-1',
  number: 'INV-000001',
  dueDate: '2026-12-01',
  total: '100.00',
  balance: '100.00',
  isOverdue: false,
};

function idempotencyKeyOf(call: unknown[]): string {
  const init = call[1] as RequestInit | undefined;
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers['Idempotency-Key'] ?? '';
}

function stubPaymentApi(
  post: (input: RequestInfo | URL, init?: RequestInit) => Response,
): { keys: string[] } {
  const keys: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/v1/contacts')) {
      return jsonResponse({ items: [CUSTOMER], total: 1, page: 1, pageSize: 100 });
    }
    if (url.startsWith('/api/v1/invoices/open')) {
      return jsonResponse([OPEN_INVOICE]);
    }
    if (url === '/api/v1/payments') {
      keys.push(idempotencyKeyOf([input, init]));
      return post(input, init);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { keys };
}

function renderForm() {
  return renderWithProviders(
    <Routes>
      <Route path="/invoicing/payments/new" element={<PaymentFormPage />} />
    </Routes>,
    { initialEntries: ['/invoicing/payments/new?customer=cust-1&invoice=inv-1'] },
  );
}

async function submitAllocation() {
  const amount = await screen.findByLabelText('Payment amount *');
  await waitFor(() => expect(amount).toHaveValue('100.00'));
  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
}

describe('record payment screen (US5)', () => {
  it('T067: requires both payments.record and invoices.read before rendering the form', () => {
    seedSignedInSession({ permissions: [PAYMENT_PERMISSIONS.record] });
    const { container } = renderWithProviders(<PaymentFormPage />, {
      initialEntries: ['/invoicing/payments/new'],
    });

    expect(container).toHaveTextContent('permission');
    expect(screen.queryByLabelText('Payment amount *')).not.toBeInTheDocument();
  });

  it('T067: shows BALANCE_CHANGED inline with the invoice, its balance and the request id', async () => {
    seedSignedInSession({
      permissions: [PAYMENT_PERMISSIONS.record, INVOICING_PERMISSIONS.read],
    });
    stubPaymentApi(() =>
      jsonResponse(
        {
          code: 'BALANCE_CHANGED',
          message: 'An invoice balance changed since you opened it. Reload and try again.',
          details: [
            {
              field: 'allocations',
              code: 'BALANCE_CHANGED',
              message: 'The balance of this invoice changed since you read it (it is now 40.00).',
              invoiceId: 'inv-1',
              currentBalance: '40.00',
            },
          ],
          requestId: 'req-balance-1',
        },
        { status: 409 },
      ),
    );
    renderForm();
    await submitAllocation();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('INV-000001');
    expect(alert).toHaveTextContent('USD 40.00');
    expect(alert).toHaveTextContent('req-balance-1');
  });

  it('T067: shows OVER_ALLOCATION inline naming the invoice and its balance', async () => {
    seedSignedInSession({
      permissions: [PAYMENT_PERMISSIONS.record, INVOICING_PERMISSIONS.read],
    });
    stubPaymentApi(() =>
      jsonResponse(
        {
          code: 'OVER_ALLOCATION',
          message: 'An allocation exceeds the invoice balance.',
          details: [
            {
              field: 'allocations',
              code: 'OVER_ALLOCATION',
              message: 'The allocation exceeds the invoice balance of 60.00.',
              invoiceId: 'inv-1',
              currentBalance: '60.00',
            },
          ],
          requestId: 'req-over-1',
        },
        { status: 400 },
      ),
    );
    renderForm();
    await submitAllocation();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('INV-000001');
    expect(alert).toHaveTextContent('USD 60.00');
    expect(alert).toHaveTextContent('req-over-1');
  });

  it('T067: a direct call the server refuses is shown with its request id', async () => {
    seedSignedInSession({
      permissions: [PAYMENT_PERMISSIONS.record, INVOICING_PERMISSIONS.read],
    });
    stubPaymentApi(() =>
      jsonResponse(
        {
          code: 'FORBIDDEN',
          message: 'You do not have permission to record payments.',
          details: [],
          requestId: 'req-forbidden-1',
        },
        { status: 403 },
      ),
    );
    renderForm();
    await submitAllocation();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('req-forbidden-1');
  });

  it('T067: reuses the key on retry and generates a new one when the form is reopened', async () => {
    seedSignedInSession({
      permissions: [PAYMENT_PERMISSIONS.record, INVOICING_PERMISSIONS.read],
    });
    const { keys } = stubPaymentApi(() =>
      jsonResponse(
        {
          code: 'INVALID_STATE_TRANSITION',
          message: 'A DRAFT invoice cannot be paid.',
          details: [],
          requestId: 'req-pay-1',
        },
        { status: 409 },
      ),
    );
    const first = renderForm();
    await submitAllocation();
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);

    // Reopening the form is a new attempt: a new key.
    first.unmount();
    renderForm();
    await submitAllocation();
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[0]);
  });
});
