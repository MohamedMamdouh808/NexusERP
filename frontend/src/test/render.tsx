import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { seedSignedInSession } from './session';

/**
 * Test harness (T048). A fresh client per case with retries off, so a failing
 * query fails once and immediately instead of hiding behind a retry loop.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  {
    initialEntries = ['/'],
    session,
  }: { initialEntries?: string[]; session?: 'signed-in' } = {},
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  // Seed the session store BEFORE rendering, so a first render already sees
  // the state the test is about and the gate does not even probe. The reset
  // between cases is the global setup's job (test/setup.ts afterEach).
  if (session === 'signed-in') {
    seedSignedInSession();
  }
  const queryClient = createTestQueryClient();

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
}

/** A minimal well-formed health report, matching the shared schema. */
export const healthyReport = {
  status: 'ok',
  uptimeSeconds: 42,
  checks: {
    application: { status: 'ok' },
    database: { status: 'ok', latencyMs: 3 },
  },
} as const;

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}