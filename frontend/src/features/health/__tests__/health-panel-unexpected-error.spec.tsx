import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test/render';
import { HealthPanel } from '../health-panel';

/**
 * The net below the three normal states (T080). `useHealth` maps every transport
 * failure into a result rather than throwing, so reaching this branch means a
 * collaborator broke its contract. The panel must still fail quietly instead of
 * showing an empty card or a blank screen - an interface that renders nothing on an
 * unexpected error is indistinguishable from one that is still loading.
 *
 * The hook is mocked on purpose: the point is a collaborator that throws, which the
 * real implementation is designed not to do.
 */
vi.mock('../use-health', () => ({
  useHealth: () => ({
    data: undefined,
    isPending: false,
    isError: true,
    error: new Error('SECRET postgresql://user:pw@127.0.0.1:5432'),
    refetch: vi.fn(),
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HealthPanel on an unexpected query error', () => {
  it('renders a failure the user can act on instead of an empty panel', () => {
    renderWithProviders(<HealthPanel />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/could not be read/i);
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });

  it('leaks nothing about the thrown error', () => {
    const { container } = renderWithProviders(<HealthPanel />);

    expect(container.textContent ?? '').not.toContain('SECRET');
    expect(container.textContent ?? '').not.toContain('postgresql://');
  });
});