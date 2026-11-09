import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, Navigate } from 'react-router-dom';

import { LoginPage } from '../login-page';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { resetSession } from '../../../test/session';

/**
 * The sign-in screen:
 *  - the fields mirror the service's own rules and validate inline;
 *  - a wrong email or password reads as ONE generic message, whatever the
 *    service said (FR-010), with the request identifier shown;
 *  - a rate limit sets a visible Retry-After countdown and disables submit;
 *  - success signs the user in and returns them to where they came from.
 */

function stubApi(handler: (path: string, init: RequestInit) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) =>
      handler(String(input), init),
    ),
  );
}

function envelope(status: number, code: string, message: string): Response {
  return jsonResponse({ code, message, details: [], requestId: 'req-42' }, { status });
}

const LOGIN_OK = {
  user: { id: 'user-1', email: 'nora@example.com' },
  membership: {
    id: 'membership-1',
    roleKey: 'administrator',
    organization: { id: 'org-1', name: "Nora's Organization" },
  },
};

const ME_SIGNED_IN = {
  user: { id: 'user-1', email: 'nora@example.com' },
  membership: { id: 'membership-1', roleKey: 'administrator', isActive: true },
  organization: { id: 'org-1', name: "Nora's Organization" },
};

const ORGANIZATIONS = [{ id: 'org-1', name: "Nora's Organization", roleKey: 'administrator' }];

beforeEach(() => {
  // A recording base stub: any test that does not set a specific handler can
  // still assert how many calls the screen made (which must be zero when only
  // client-side validation was involved).
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
  document.cookie = 'csrf_token=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSession();
});

describe('LoginPage', () => {
  it('renders the email and password fields', () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('validates inline: a required email and a required password', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    // Nothing was sent.
    expect(vi.mocked(fetch).mock.calls.length).toBe(0);
  });

  it('rejects a malformed email inline before contacting the service', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'not-an-email');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.length).toBe(0);
  });

  it('shows the generic wrong-credential error with the request identifier', async () => {
    stubApi(() => envelope(404, 'NOT_FOUND', 'Record not found.'));
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'nora@example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'Correct-Horse-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('The email address or password is not correct.'),
    ).toBeInTheDocument();
    // The request identifier is shown so the failure can be looked up.
    expect(screen.getByText(/Reference ID:/)).toBeInTheDocument();
    expect(screen.getByText('req-42')).toBeInTheDocument();
  });

  it('honours a rate limit with a visible Retry-After countdown and a disabled button', async () => {
    stubApi(() =>
      jsonResponse(
        { code: 'TOO_MANY_REQUESTS', message: 'Too many requests.', details: [], requestId: 'req-429' },
        { status: 429, headers: { 'retry-after': '30' } },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'nora@example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'Correct-Horse-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Too many attempts. Try again in 30 seconds.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();
    // The countdown ticks at least once toward the end.
    await vi.waitFor(
      () => expect(screen.getByText(/^Too many attempts\. Try again in \d+ second/)).toBeDefined(),
      { timeout: 3000 },
    );
    expect(screen.getByText(/Reference ID:/)).toBeInTheDocument();
  });

  it('signs the user in and returns them to the page they asked for', async () => {
    stubApi((path) => {
      if (path.endsWith('/auth/login')) return jsonResponse(LOGIN_OK);
      if (path.endsWith('/auth/me')) return jsonResponse(ME_SIGNED_IN);
      if (path.endsWith('/auth/organizations')) return jsonResponse(ORGANIZATIONS);
      throw new Error(`unexpected ${path}`);
    });
    document.cookie = 'csrf_token=csrf-123;path=/';
    const user = userEvent.setup();
    // The gate remembers '/products' by navigating with state, exactly as it
    // does in the real shell when it redirects a signed-out visitor.
    const Referrer = () => <Navigate to="/login" state={{ from: '/products' }} replace />;
    renderWithProviders(
      <Routes>
        <Route path="/" element={<Referrer />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/products" element={<p>the products screen the user asked for</p>} />
      </Routes>,
      { initialEntries: ['/'] },
    );

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'nora@example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'Correct-Horse-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // Success returns the user to where the gate remembered they were going.
    await waitFor(() =>
      expect(screen.getByText('the products screen the user asked for')).toBeInTheDocument(),
    );
    // The sign-in screen is gone.
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('shows the pending spinner while signing in', async () => {
    let resolveLogin: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (input: RequestInfo | URL) =>
          new Promise<Response>((resolve) => {
            resolveLogin = resolve;
            void input;
          }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'nora@example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'Correct-Horse-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const button = await screen.findByRole('button', { name: 'Signing in…' });
    expect(button).toBeDisabled();
    resolveLogin(envelope(404, 'NOT_FOUND', 'Record not found.'));
  });
});
