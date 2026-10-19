import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test/render';
import { HealthPanel } from '../health-panel';

/**
 * T079. The loading state is a state in its own right. An empty panel while a
 * request is in flight reads as "healthy and nothing to report", which is a claim
 * the interface has not earned yet.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HealthPanel loading state (T079)', () => {
  it('shows a skeleton while the report is being fetched', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    renderWithProviders(<HealthPanel />);

    const loading = screen.getByRole('status');
    expect(loading).toHaveTextContent(/loading the system health report/i);
    expect(loading).toHaveAttribute('aria-busy', 'true');
  });

  it('does not claim the system is healthy before the service has answered', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    renderWithProviders(<HealthPanel />);

    expect(screen.queryByText(/healthy/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces the wait rather than animating silently', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    renderWithProviders(<HealthPanel />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});