import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvoiceDetailPage } from '../invoice-detail-page';
import { PaymentDetailPage } from '../payment-detail-page';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { seedSignedInSession } from '../../../test/session';

/**
 * US5 (T066): the idempotency-key lifecycle.
 *
 * A key is generated when a dialog OPENS and reused on every retry of the same
 * attempt; a definite answer (success or a refusal the service sent) ends the
 * attempt, so reopening generates a new key; an unknown outcome (the service
 * could not be reached) does not end it, so reopening reuses the key. A double
 * click acts once because the confirm button disables while the attempt runs.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const LABEL = 'Operational invoice - not a tax invoice';

const DRAFT = {
  id: 'inv-1',
  number: null,
  orderId: 'so-1',
  orderNumber: 'SO-000001',
  customerId: 'cust-1',
  customerName: 'Acme Retail',
  status: 'DRAFT',
  issueDate: null,
  dueDate: '2026-12-01',
  lines: [],
  total: '100.00',
  paid: '0.00',
  balance: '100.00',
  isOverdue: false,
  voidReason: null,
  voidedAt: null,
  voidedBy: null,
  version: 1,
  label: LABEL,
  paymentsApplied: [],
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
};

const PAYMENT = {
  id: 'pay-1',
  number: 'PAY-000001',
  customerId: 'cust-1',
  customerName: 'Acme Retail',
  amount: '100.00',
  paymentDate: '2026-11-10',
  method: 'BANK_TRANSFER',
  reference: null,
  status: 'RECORDED',
  allocations: [],
  reversal: null,
  recordedBy: 'user-1',
  recordedAt: '2026-11-10T09:00:00.000Z',
};

function idempotencyKeyOf(call: unknown[]): string {
  const init = call[1] as RequestInit | undefined;
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers['Idempotency-Key'] ?? '';
}

function stubInvoiceDetail(issue: (key: string) => Response | Promise<Response> | never) {
  const keys: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/v1/invoices/inv-1' && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse(DRAFT);
    }
    if (url === '/api/v1/invoices/inv-1/issue') {
      const key = idempotencyKeyOf([input, init]);
      keys.push(key);
      return issue(key);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { keys, fetchMock };
}

function renderInvoiceDetail() {
  renderWithProviders(
    <Routes>
      <Route path="/invoicing/:id" element={<InvoiceDetailPage />} />
    </Routes>,
    { initialEntries: ['/invoicing/inv-1'] },
  );
}

describe('invoicing dialogs (US5)', () => {
  it('T066: reuses the key on retry, then generates a new one after a definite answer', async () => {
    seedSignedInSession();
    let mode: 'refused' | 'accepted' = 'refused';
    const { keys } = stubInvoiceDetail(() => {
      if (mode === 'refused') {
        return jsonResponse(
          {
            code: 'INVALID_STATE_TRANSITION',
            message: 'This invoice cannot be issued.',
            details: [],
            requestId: 'req-issue-1',
          },
          { status: 409 },
        );
      }
      return jsonResponse({ ...DRAFT, number: 'INV-000001', status: 'ISSUED' });
    });
    renderInvoiceDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Issue' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }));
    await screen.findByRole('alert');

    // The dialog stays open; the retry carries the SAME key.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).not.toBe('');
    expect(keys[1]).toBe(keys[0]);

    // A definite answer ends the attempt: reopening generates a new key.
    mode = 'accepted';
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }));
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).toBe(keys[0]);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: 'Issue' }));
    const reopened = await screen.findByRole('alertdialog');
    fireEvent.click(within(reopened).getByRole('button', { name: 'Issue invoice' }));
    await waitFor(() => expect(keys).toHaveLength(4));
    expect(keys[3]).not.toBe(keys[0]);
  });

  it('T066: reuses the key after an unknown outcome (the service was not reached)', async () => {
    seedSignedInSession();
    const { keys } = stubInvoiceDetail(() => {
      throw new TypeError('Failed to fetch');
    });
    renderInvoiceDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Issue' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invoice' }));
    await screen.findByRole('alert');
    expect(keys).toHaveLength(1);

    // Close and reopen: the outcome was never known, so the same key returns.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Issue' }));
    const reopened = await screen.findByRole('alertdialog');
    fireEvent.click(within(reopened).getByRole('button', { name: 'Issue invoice' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });

  it('T066: the Reverse dialog reuses its key on retry and renews it after a definite refusal', async () => {
    seedSignedInSession();
    const keys: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/payments/pay-1' && (init?.method ?? 'GET') === 'GET') {
        return jsonResponse(PAYMENT);
      }
      if (url === '/api/v1/payments/pay-1/reverse') {
        keys.push(idempotencyKeyOf([input, init]));
        return jsonResponse(
          {
            code: 'INVALID_STATE_TRANSITION',
            message: 'This payment has already been reversed.',
            details: [],
            requestId: 'req-reverse-1',
          },
          { status: 409 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/invoicing/payments/:id" element={<PaymentDetailPage />} />
      </Routes>,
      { initialEntries: ['/invoicing/payments/pay-1'] },
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Reverse payment' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason *'), {
      target: { value: 'Recorded twice' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reverse payment' }));
    await screen.findByRole('alert');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reverse payment' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);

    // A refusal the service sent is a definite answer: reopening renews the key.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reverse payment' }));
    const reopened = await screen.findByRole('dialog');
    fireEvent.change(within(reopened).getByLabelText('Reason *'), {
      target: { value: 'Recorded twice' },
    });
    fireEvent.click(within(reopened).getByRole('button', { name: 'Reverse payment' }));
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[0]);
  });
});
