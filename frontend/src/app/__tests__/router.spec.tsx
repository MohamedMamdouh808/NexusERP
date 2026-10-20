import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NAVIGATION } from '../../components/shell/navigation';
import { healthyReport, jsonResponse, createTestQueryClient } from '../../test/render';
import { createQueryClient } from '../query-client';
import { routes } from '../router';

/** Every entry the sidebar offers as a destination, in the sidebar's own order. */
const availableEntries = NAVIGATION.flatMap((group) =>
  group.entries.filter((entry) => entry.state === 'available'),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('Router (T088)', () => {
  it('serves the overview at the root', () => {
    renderRoute('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('serves the health panel at /health through the shell', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(healthyReport)));

    renderRoute('/health');

    expect(screen.getByRole('heading', { level: 1, name: 'System health' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(await screen.findByText(/uptime 42 seconds/i)).toBeInTheDocument();
  });

  it('redirects an unknown address to the overview rather than showing an empty shell', async () => {
    const router = renderRoute('/no-such-screen');

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
  });
});

describe('Every destination the sidebar offers resolves (T019)', () => {
  it.each(availableEntries.map((entry) => [entry.label, entry.path] as const))(
    'serves %s at %s',
    (_label, path) => {
      const router = createMemoryRouter(routes, { initialEntries: [path] });
      const matched = router.state.matches.at(-1);

      expect(matched, `${path} must resolve`).toBeDefined();
      // '*' is the catch-all that redirects home. Reaching it means the sidebar
      // advertised a destination the application does not actually serve, which
      // is exactly the claim FR-007 makes (FR-010).
      expect(matched?.route.path, `${path} must not fall through to the catch-all`).toBe(path);
    },
  );

  it('reaches the Overview screen at the path the list gives Overview', () => {
    const overview = availableEntries.find((entry) => entry.label === 'Overview');
    expect(overview?.path).toBe('/');

    renderRoute(overview?.path ?? '/no-such-screen');

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
  });

  it('reaches the live health panel at the path the list gives System Health', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(healthyReport)));

    const systemHealth = availableEntries.find((entry) => entry.label === 'System Health');
    expect(systemHealth?.path).toBe('/health');

    renderRoute(systemHealth?.path ?? '/no-such-screen');

    expect(await screen.findByText(/uptime 42 seconds/i)).toBeInTheDocument();
  });
});

describe('Query client (T088)', () => {
  it('never retries a failure on its own', () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions().queries?.retry).toBe(false);
  });

  it('refreshes when a user returns to the tab', () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(true);
  });
});