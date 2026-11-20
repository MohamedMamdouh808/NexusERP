import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StockBalancesTab } from '../balances-tab';
import { jsonResponse, renderWithProviders } from '../../../test/render';

/**
 * T051. The adjust-stock dialog's exactly-once behaviour, as the interface
 * carries its half of it.
 *
 * The idempotency key is generated when the dialog OPENS and stays for the
 * dialog's lifetime: a retry after a refused attempt sends the SAME key, so
 * the service can safely replay or refuse. A refusal is shown inline with the
 * request identifier, so the operator can quote it against the server log.
 */

const WAREHOUSES = {
  items: [
    { id: 'w-1', name: 'Main Warehouse', isDefault: true, isActive: true, version: 1 },
  ],
  total: 1,
};

const BALANCES = {
  items: [
    {
      productId: 'p-1',
      sku: 'SKU-1',
      productName: 'Drill',
      warehouseId: 'w-1',
      warehouseName: 'Main Warehouse',
      onHand: '5.000',
      reserved: '1.000',
      available: '4.000',
      archived: false,
      status: 'IN_STOCK',
      hasStockRow: true,
    },
  ],
  total: 1,
  totalKind: 'rows',
  lowStockCount: 0,
};

function refuseOnceThenAnswer() {
  let refused = false;
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith('/api/v1/warehouses')) {
      return jsonResponse(WAREHOUSES);
    }
    if (url.includes('status=archivedWithStock')) {
      return jsonResponse({ items: [], total: 0, totalKind: 'products', lowStockCount: 0 });
    }
    if (url.startsWith('/api/v1/inventory/stock-balances')) {
      return jsonResponse(BALANCES);
    }
    if (url.startsWith('/api/v1/inventory/adjustments')) {
      if (!refused) {
        refused = true;
        return jsonResponse(
          {
            code: 'CONFLICT',
            message: 'The adjustment would leave the balance negative.',
            details: [],
            requestId: 'req-abc-1',
          },
          { status: 409 },
        );
      }
      return jsonResponse(
        {
          movement: { id: 'm-1', sourceNumber: 'ADJ-00007', quantityDelta: '1.000', type: 'ADJUSTMENT' },
          balance: { warehouseId: 'w-1', productId: 'p-1', onHand: '6.000', reserved: '1.000', available: '5.000' },
        },
        { status: 201 },
      );
    }
    throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
  });
}

function adjustmentPosts() {
  return fetchMock.mock.calls
    .filter((call) => String(call[0]).includes('/inventory/adjustments'))
    .map((call) => {
      const init = call[1] as RequestInit;
      return {
        key: (init.headers as Record<string, string>)['Idempotency-Key'],
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      };
    });
}

let fetchMock: ReturnType<typeof refuseOnceThenAnswer>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the adjust-stock dialog (T051)', () => {
  it('opens from the deep link with the product preselected', async () => {
    fetchMock = refuseOnceThenAnswer();
    vi.stubGlobal('fetch', fetchMock);

    // The archived product's detail page deep-links here with ?adjust=<id>.
    renderWithProviders(<StockBalancesTab />, { initialEntries: ['/inventory?adjust=p-1'] });

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Drill')).toBeInTheDocument();
  });

  it('generates the key on open, reuses it on a retry, and shows the refusal inline with its request identifier', async () => {
    fetchMock = refuseOnceThenAnswer();
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<StockBalancesTab />, { initialEntries: ['/inventory?adjust=p-1'] });

    await screen.findByRole('dialog');

    fireEvent.change(screen.getByLabelText('Signed quantity *'), {
      target: { value: '1.000' },
    });
    fireEvent.click(screen.getByText('Post adjustment'));

    // The refusal is inline, in the dialog, with the request identifier.
    await waitFor(() => {
      expect(screen.getByText('The adjustment would leave the balance negative.')).toBeInTheDocument();
    });
    expect(screen.getByText('Request identifier: req-abc-1')).toBeInTheDocument();
    // The dialog stays open: nothing was posted.
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The retry sends the SAME key: the service can tell a retry from a
    // second posting.
    fireEvent.click(screen.getByText('Post adjustment'));
    await waitFor(() => {
      expect(screen.getByText('Stock adjusted for Drill: ADJ-00007')).toBeInTheDocument();
    });

    const posts = adjustmentPosts();
    expect(posts).toHaveLength(2);
    expect(posts[0]!.key).toBeTruthy();
    expect(posts[1]!.key).toBe(posts[0]!.key);
    expect(posts[1]!.body).toMatchObject({
      warehouseId: 'w-1',
      productId: 'p-1',
      quantity: '1.000',
      reason: 'FOUND',
    });

    // Success closes the dialog and confirms with the document number.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
