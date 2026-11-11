import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '../../../test/render';
import { jsonResponse } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';
import { ProductNewPage } from '../product-new-page';
import { ProductsPage } from '../products-page';

/**
 * The product screens against the real service.
 *
 * What the screens owe the user: the rules the service enforces are checked
 * before anything is sent, a refusal is shown against the field that caused
 * it, an action the member may not perform is not offered at all, and a name
 * that already exists is pointed out without blocking the save.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  resetSession();
});

const CATEGORY = { id: 'cat-1', name: 'Apparel' };
const UNIT = { id: 'unit-1', name: 'piece', abbreviation: 'pc' };

function stubService(
  overrides: {
    products?: unknown[];
    createStatus?: number;
    createBody?: unknown;
  } = {},
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.includes('/product-categories') && init.method !== 'POST') {
      return jsonResponse([CATEGORY]);
    }
    if (url.includes('/units-of-measure') && init.method !== 'POST') {
      return jsonResponse([UNIT]);
    }
    if (url.includes('/api/v1/products') && init.method === 'POST') {
      return jsonResponse(
        overrides.createBody ?? { id: 'p1', code: 'SKU-1001' },
        { status: overrides.createStatus ?? 201 },
      );
    }
    if (url.includes('/api/v1/products')) {
      return jsonResponse({ items: overrides.products ?? [], total: 0, page: 1, pageSize: 25 });
    }
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('the new product form', () => {
  it('refuses a price with too many decimals and sends nothing', async () => {
    const fetchMock = stubService();
    const user = userEvent.setup();

    seedSignedInSession();
    renderWithProviders(<ProductNewPage />);

    await user.type(await screen.findByLabelText(/^Name/), 'Blue T-Shirt');
    await user.type(screen.getByLabelText(/^SKU/), 'SKU-1001');
    await user.selectOptions(await screen.findByLabelText(/^Category/), CATEGORY.id);
    await user.selectOptions(screen.getByLabelText(/^Unit of measure/), UNIT.id);
    await user.type(screen.getByLabelText(/^Purchase price/), '4.50000');
    await user.type(screen.getByLabelText(/^Selling price/), '9.9900');
    await user.click(screen.getByRole('button', { name: 'Create Product' }));

    expect(
      await screen.findByText('Purchase price must be a decimal with at most 4 decimal places.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/products'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refuses a negative price and sends nothing', async () => {
    const fetchMock = stubService();
    const user = userEvent.setup();

    seedSignedInSession();
    renderWithProviders(<ProductNewPage />);

    await user.type(await screen.findByLabelText(/^Name/), 'Blue T-Shirt');
    await user.type(screen.getByLabelText(/^SKU/), 'SKU-1001');
    await user.selectOptions(await screen.findByLabelText(/^Category/), CATEGORY.id);
    await user.selectOptions(screen.getByLabelText(/^Unit of measure/), UNIT.id);
    await user.type(screen.getByLabelText(/^Purchase price/), '-1.0000');
    await user.type(screen.getByLabelText(/^Selling price/), '9.9900');
    await user.click(screen.getByRole('button', { name: 'Create Product' }));

    expect(await screen.findByText('Purchase price must not be negative.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/products'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('labels the reorder level the way the rest of the interface names it', async () => {
    stubService();
    seedSignedInSession();
    renderWithProviders(<ProductNewPage />);

    expect(await screen.findByLabelText('Reorder level (low-stock threshold)')).toBeInTheDocument();
  });

  it('warns about a product with the same name without blocking the save', async () => {
    stubService({
      products: [{ id: 'other-1', sku: 'SKU-9999', name: 'Blue T-Shirt' }],
    });
    const user = userEvent.setup();

    seedSignedInSession();
    renderWithProviders(<ProductNewPage />);

    await user.type(await screen.findByLabelText(/^Name/), 'Blue T-Shirt');

    // The notice names the other product's SKU.
    expect(await screen.findByText(/SKU-9999/)).toBeInTheDocument();

    // And the save still goes through.
    await user.type(screen.getByLabelText(/^SKU/), 'SKU-1001');
    await user.selectOptions(await screen.findByLabelText(/^Category/), CATEGORY.id);
    await user.selectOptions(screen.getByLabelText(/^Unit of measure/), UNIT.id);
    await user.type(screen.getByLabelText(/^Purchase price/), '4.5000');
    await user.type(screen.getByLabelText(/^Selling price/), '9.9900');
    await user.click(screen.getByRole('button', { name: 'Create Product' }));

    await waitFor(() =>
      expect(
        vi
          .mocked(globalThis.fetch)
          .mock.calls.some(
            ([url, init]) =>
              String(url).includes('/api/v1/products') &&
              (init as RequestInit | undefined)?.method === 'POST',
          ),
      ).toBe(true),
    );
  });

  it('shows the service\'s refusal with its reference identifier', async () => {
    stubService({
      createStatus: 409,
      createBody: {
        code: 'DUPLICATE_RECORD',
        message: 'A product with this SKU already exists: Blue T-Shirt',
        details: [],
        requestId: 'req-dup-1',
      },
    });
    const user = userEvent.setup();

    seedSignedInSession();
    renderWithProviders(<ProductNewPage />);

    await user.type(await screen.findByLabelText(/^Name/), 'Blue T-Shirt');
    await user.type(screen.getByLabelText(/^SKU/), 'SKU-1001');
    await user.selectOptions(await screen.findByLabelText(/^Category/), CATEGORY.id);
    await user.selectOptions(screen.getByLabelText(/^Unit of measure/), UNIT.id);
    await user.type(screen.getByLabelText(/^Purchase price/), '4.5000');
    await user.type(screen.getByLabelText(/^Selling price/), '9.9900');
    await user.click(screen.getByRole('button', { name: 'Create Product' }));

    expect(
      await screen.findByText('A product with this SKU already exists: Blue T-Shirt'),
    ).toBeInTheDocument();
    expect(screen.getByText('req-dup-1')).toBeInTheDocument();
  });

  it('offers no form at all to a member without products.write', async () => {
    stubService();
    seedSignedInSession({ permissions: ['products.read'] });

    renderWithProviders(<ProductNewPage />);

    expect(
      await screen.findByText('You do not have permission to create products.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Product' })).toBeNull();
  });
});

describe('the product list', () => {
  it('offers no create action to a member without products.write', async () => {
    stubService();
    seedSignedInSession({ permissions: ['products.read'] });

    renderWithProviders(<ProductsPage />);

    await waitFor(() => expect(screen.getByLabelText(/^Search/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'New Product' })).toBeNull();
  });

  it('marks an archived product with its badge', async () => {
    stubService({
      products: [
        {
          id: 'p1',
          sku: 'SKU-1001',
          name: 'Blue T-Shirt',
          categoryId: 'cat-1',
          unitId: 'unit-1',
          purchasePrice: '4.5000',
          sellingPrice: '9.9900',
          lowStockThreshold: null,
          isArchived: true,
          version: 1,
          createdAt: '2026-11-11T20:00:00.000Z',
          updatedAt: '2026-11-11T20:00:00.000Z',
        },
      ],
    });
    seedSignedInSession();

    renderWithProviders(<ProductsPage />);

    // Wait for the row itself: the status filter also offers an "Archived"
    // option, so the badge has to be asserted on the row.
    const sku = await screen.findByText('SKU-1001');
    expect(sku.closest('tr')?.textContent).toContain('Archived');
  });
});
