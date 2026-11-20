import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReceiveGoodsDialog } from '../receive-goods-dialog';
import { jsonResponse, renderWithProviders } from '../../../test/render';

/**
 * T067. The receive dialog's exactly-once behaviour, as the interface carries
 * its half of it.
 *
 * The dialog opens with blank quantities and offers one shortcut, "Receive all
 * outstanding". A line that is fully received cannot be entered against. The
 * post button stays disabled while every quantity is blank or zero, and the
 * first post goes through a confirmation step that shows what will happen -
 * how many lines, how much, the resulting status and the consequence. The
 * idempotency key is generated when the dialog OPENS and stays for its
 * lifetime: after an unknown outcome (a refusal, a lost answer) the retry
 * sends the SAME key, and a refusal is shown inline with the request
 * identifier.
 */

const ORDER = {
  id: 'po-1',
  number: 'PO-000001',
  supplierId: 'sup-1',
  supplierName: 'Acme Supplies',
  warehouseId: 'w-1',
  warehouseName: 'Main Warehouse',
  status: 'PARTIALLY_RECEIVED',
  orderDate: '2026-11-01',
  expectedDate: null,
  notes: '',
  total: '200.00',
  version: 3,
  lines: [
    {
      id: 'line-1',
      productId: 'p-1',
      productSku: 'SKU-1',
      productName: 'Drill',
      quantity: '10.000',
      received: '4.000',
      outstanding: '6.000',
      unitCost: '10.0000',
      unitOfMeasure: 'piece',
      lineTotal: '100.00',
    },
    {
      id: 'line-2',
      productId: 'p-2',
      productSku: 'SKU-2',
      productName: 'Bolt',
      quantity: '4.000',
      received: '4.000',
      outstanding: '0.000',
      unitCost: '25.0000',
      unitOfMeasure: 'box',
      lineTotal: '100.00',
    },
  ],
} as const;

let fetchMock: ReturnType<typeof buildRouter>;

function buildRouter(options: { refuseFirst?: boolean; receiptStatus?: number } = {}) {
  let postCount = 0;
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url === '/api/v1/purchase-orders/po-1' && (init.method ?? 'GET') === 'GET') {
      return jsonResponse(ORDER);
    }
    if (url === '/api/v1/purchase-orders/po-1/receipts') {
      postCount += 1;
      if (options.refuseFirst === true && postCount === 1) {
        return jsonResponse(
          {
            code: 'CONFLICT',
            message: 'The received quantity exceeds what is outstanding.',
            details: [],
            requestId: 'req-abc-1',
          },
          { status: options.receiptStatus ?? 409 },
        );
      }
      return jsonResponse(
        {
          receipt: { id: 'gr-1', number: 'GR-000007', receivedAt: '2026-11-13T10:00:00.000Z' },
          order: { id: 'po-1', number: 'PO-000001', status: 'RECEIVED', version: 4 },
        },
        { status: 201 },
      );
    }
    throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
  });
}

function receiptPosts() {
  return fetchMock.mock.calls
    .filter((call) => String(call[0]) === '/api/v1/purchase-orders/po-1/receipts')
    .map((call) => {
      const init = call[1] as RequestInit;
      return {
        key: (init.headers as Record<string, string>)['Idempotency-Key'],
        body: JSON.parse(String(init.body)) as { lines: Array<{ lineId: string; productId: string; quantity: string }> },
      };
    });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderDialog(overrides: Partial<Parameters<typeof ReceiveGoodsDialog>[0]> = {}) {
  const onPosted = vi.fn();
  // The harness mirrors the screens: the dialog is conditionally rendered and
  // disappears when it closes.
  function Harness() {
    const [open, setOpen] = useState(true);
    if (!open) return null;
    return (
      <ReceiveGoodsDialog
        orderId="po-1"
        idempotencyKey="test-key-1"
        onClose={() => setOpen(false)}
        onPosted={(number) => {
          setOpen(false);
          onPosted(number);
        }}
        {...overrides}
      />
    );
  }
  renderWithProviders(createElement(Harness));
  return { onPosted };
}

describe('the receive dialog (T067)', () => {
  it('opens with blank quantities, disables the fully-received line, and fills everything outstanding via the shortcut', async () => {
    fetchMock = buildRouter();
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    const inputs = await screen.findAllByLabelText('Receive now');
    expect(inputs[0]).toHaveValue('');
    expect(inputs[1]).toHaveValue('');

    // The fully-received line cannot be entered against.
    expect(inputs[1]).toBeDisabled();
    expect(screen.getByText('Fully received')).toBeInTheDocument();

    // The shortcut fills the outstanding quantity of the open line only.
    fireEvent.click(screen.getByText('Receive all outstanding'));
    const filled = screen.getAllByLabelText('Receive now');
    expect(filled[0]).toHaveValue('6.000');
    expect(filled[1]).toHaveValue('');
  });

  it('keeps the review action disabled while every quantity is blank or zero', async () => {
    fetchMock = buildRouter();
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    const review = await screen.findByRole('button', { name: 'Review receipt' });
    expect(review).toBeDisabled();

    // An explicit zero is not enough either.
    const [firstInput] = await screen.findAllByLabelText('Receive now');
    fireEvent.change(firstInput, { target: { value: '0.000' } });
    expect(screen.getByRole('button', { name: 'Review receipt' })).toBeDisabled();

    fireEvent.change(firstInput, { target: { value: '2.000' } });
    expect(screen.getByRole('button', { name: 'Review receipt' })).toBeEnabled();
  });

  it('shows the confirmation summary before posting, and posts only from it', async () => {
    fetchMock = buildRouter();
    vi.stubGlobal('fetch', fetchMock);

    const { onPosted } = renderDialog();

    fireEvent.click(await screen.findByText('Receive all outstanding'));
    fireEvent.click(screen.getByRole('button', { name: 'Review receipt' }));

    // The confirmation summary is on screen and NOTHING has been posted yet.
    expect(screen.getByText('Confirm the goods receipt')).toBeInTheDocument();
    expect(screen.getByText('PO-000001')).toBeInTheDocument();
    expect(screen.getByText('6 piece × SKU-1')).toBeInTheDocument();
    expect(screen.getByText('Receipts increase stock immediately. A posted receipt cannot be edited or deleted.')).toBeInTheDocument();
    expect(receiptPosts()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Post receipt' }));

    await waitFor(() => expect(onPosted).toHaveBeenCalledWith('GR-000007'));
    const posts = receiptPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.key).toBe('test-key-1');
    expect(posts[0]!.body.lines).toEqual([
      { lineId: 'line-1', productId: 'p-1', quantity: '6.000' },
      { lineId: 'line-2', productId: 'p-2', quantity: '0.000' },
    ]);
  });

  it('shows a refusal inline with its request identifier and keeps the key on the retry', async () => {
    fetchMock = buildRouter({ refuseFirst: true });
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();

    fireEvent.click(await screen.findByText('Receive all outstanding'));
    fireEvent.click(screen.getByRole('button', { name: 'Review receipt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Post receipt' }));

    expect(await screen.findByText('The received quantity exceeds what is outstanding.')).toBeInTheDocument();
    expect(screen.getByText('Request identifier: req-abc-1')).toBeInTheDocument();

    // The dialog stays open; the retry sends the SAME key.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Post receipt' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const posts = receiptPosts();
    expect(posts).toHaveLength(2);
    expect(posts[1]!.key).toBe(posts[0]!.key);
    expect(posts[0]!.key).toBe('test-key-1');
  });
});
