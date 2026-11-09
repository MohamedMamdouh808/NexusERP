import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { SessionGate } from '../session-gate';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';

/**
 * The session gate:
 *  - pending: a full-page status while the probe runs, not a flash of the
 *    signed-out UI;
 *  - signed-out: redirect to /login, remembering where the user asked to go;
 *  - unreachable: an honest error with a retry, NOT a false sign-out.
 */

const ME_SIGNED_IN = {
  user: { id: 'user-1', email: 'nora@example.com' },
  membership: { id: 'membership-1', roleKey: 'administrator', isActive: true },
  organization: { id: 'org-1', name: "Nora's Organization" },
};

const ORGANIZATIONS = [{ id: 'org-1', name: "Nora's Organization", roleKey: 'administrator' }];

afterEach(() => {
  vi.unstubAllGlobals();
  resetSession();
});

describe('SessionGate', () => {
  it('renders children when the store already holds a signed-in session', () => {
    seedSignedInSession();
    renderWithProviders(
      <SessionGate>
        <p>seaway content marker</p>
      </SessionGate>,
    );

    expect(screen.getByText('seaway content marker')).toBeInTheDocument();
  });

  it('redirects a signed-out visitor to /login, remembering the route they asked for', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      { code: 'UNAUTHENTICATED', message: 'Authentication required.', details: [], requestId: 'probe-1' },
      { status: 401 },
    )));

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<p>the sign-in screen</p>} />
        <Route path="*" element={<SessionGate><p>never rendered</p></SessionGate>} />
      </Routes>,
      { initialEntries: ['/products'] },
    );

    await waitFor(() => expect(screen.getByText('the sign-in screen')).toBeInTheDocument());

    // Never shows the guarded content.
    expect(screen.queryByText('never rendered')).toBeNull();
  });

  it('shows the pending status first, not the signed-out UI', () => {
    // No fetch stub at all: the probe would hang/throw, so the store stays
    // pending through the synchronous reads this assertion covers.
    renderWithProviders(
      <SessionGate>
        <p>guarded content</p>
      </SessionGate>,
    );

    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    expect(screen.queryByText('guarded content')).toBeNull();
  });

  it('answers an unreachable probe with an error and a retry, not a redirect', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    renderWithProviders(
      <SessionGate>
        <p>guarded content</p>
      </SessionGate>,
    );

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('guarded content')).toBeNull();

    // The retry re-probes, and the service is back: children render.
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/auth/me')) return jsonResponse(ME_SIGNED_IN);
      if (path.endsWith('/auth/organizations')) return jsonResponse(ORGANIZATIONS);
      throw new Error(`unexpected ${path}`);
    }));
    screen.getByRole('button', { name: 'Retry' }).click();

    await waitFor(() => expect(screen.getByText('guarded content')).toBeInTheDocument());
  });
});
