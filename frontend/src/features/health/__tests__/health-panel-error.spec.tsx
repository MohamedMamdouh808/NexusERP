import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderWithProviders } from '../../../test/render';
import { HealthPanel } from '../health-panel';

/**
 * T080. When the service is unreachable the panel must do three things and no
 * more: say what happened, offer a way to try again, and hand over the identifier
 * that ties the failure to the server log. It must not explain WHY - the service
 * keeps the cause out of the response on purpose (FR-035), so any cause rendered
 * here would be invented.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const envelope = {
  code: 'INTERNAL_ERROR',
  message: 'The request could not be completed.',
  details: [],
  requestId: 'req-7f3a-9c21',
};

describe('HealthPanel failure state (T080)', () => {
  it('shows the failure and the request identifier so the failure can be quoted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(envelope, { status: 500 })));

    renderWithProviders(<HealthPanel />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The request could not be completed.');
    expect(screen.getByText('req-7f3a-9c21')).toBeInTheDocument();
  });

  it('offers a retry action that actually issues another request', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(envelope, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderWithProviders(<HealthPanel />);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /check again/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('does not retry on its own, which would hide the failure behind a loop', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(envelope, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<HealthPanel />);
    await screen.findByRole('alert');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable service as a failure rather than an exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    renderWithProviders(<HealthPanel />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be reached/i);
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });

  it('honours Retry-After on a 429 instead of inviting a retry into the limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many requests. Please wait a moment and try again.',
            details: [],
            requestId: 'req-429-0001',
          },
          { status: 429, headers: { 'retry-after': '30' } },
        ),
      ),
    );

    renderWithProviders(<HealthPanel />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/too many requests/i);
    expect(screen.getByText(/try again in 30 seconds/i)).toBeInTheDocument();
    expect(screen.getByText('req-429-0001')).toBeInTheDocument();
  });

  it('says nothing about how long to wait when the service did not say', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many requests. Please wait a moment and try again.',
            details: [],
            requestId: 'req-429-0002',
          },
          { status: 429 },
        ),
      ),
    );

    renderWithProviders(<HealthPanel />);
    await screen.findByRole('alert');

    expect(screen.queryByText(/try again in/i)).not.toBeInTheDocument();
  });

  it('renders no cause, no stack and no connection detail, even when the response carries some', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            ...envelope,
            details: [{ field: 'database', issue: 'connection refused' }],
            stack: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
            cause: 'postgresql://nexuserp:secret@127.0.0.1:5432/nexuserp',
          },
          { status: 500 },
        ),
      ),
    );

    const { container } = renderWithProviders(<HealthPanel />);
    await screen.findByRole('alert');

    const rendered = container.textContent ?? '';
    for (const forbidden of [
      'postgresql://',
      'ECONNREFUSED',
      '127.0.0.1',
      '5432',
      'node_modules',
      'stack',
      'Error:',
      'secret',
      'connection refused',
    ]) {
      expect(rendered).not.toContain(forbidden);
    }
  });
});