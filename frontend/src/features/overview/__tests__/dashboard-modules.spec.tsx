/**
 * T041 - Overview skips module-dependent requests when a module is disabled (FR-041).
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDashboardWidgets } from '../use-dashboard';
import { createTestQueryClient, jsonResponse } from '../../../test/render';
import { resetSession, seedSignedInSession, TEST_ORGANIZATION } from '../../../test/session';

function wrapper() {
  const client = createTestQueryClient();
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe('Dashboard module-aware requests (T041, FR-041)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSession();
  });

  it('does not request sales-dependent data when sales is disabled', async () => {
    seedSignedInSession({
      organization: { ...TEST_ORGANIZATION, enabledModules: ['inventory', 'purchasing', 'invoicing', 'reports'] },
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({ items: [], total: 0, value: '0', change: '0' }));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useDashboardWidgets(), { wrapper: wrapper() });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/sales-orders'))).toBe(false);
  });
});
