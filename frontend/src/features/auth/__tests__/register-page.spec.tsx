import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

import { RegisterPage, PASSWORD_RULE } from '../register-page';
import { getSessionState } from '../../../services/auth-session';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { resetSession } from '../../../test/session';

/**
 * The registration screen: email + password only (the service's schema is
 * strict; the first organization is created by the service). The password rule
 * mirrors the backend: at least 12 characters with upper/lower/digit. A
 * successful registration signs the user in and opens the shell.
 */

function stubApi(handler: (path: string) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => handler(String(input))),
  );
}

function envelopes(): (path: string) => Response {
  const REGISTER_OK = {
    user: { id: 'user-9', email: 'new.user@example.com' },
    organization: { id: 'org-9', name: "new.user@example.com's Organization" },
  };
  const LOGIN_OK = {
    user: { id: 'user-9', email: 'new.user@example.com' },
    membership: {
      id: 'membership-9',
      roleKey: 'administrator',
      organization: { id: 'org-9', name: "new.user@example.com's Organization" },
    },
  };
  const ME_OK = {
    user: { id: 'user-9', email: 'new.user@example.com' },
    membership: { id: 'membership-9', roleKey: 'administrator', isActive: true },
    organization: { id: 'org-9', name: "new.user@example.com's Organization" },
  };
  const ORGS = [{ id: 'org-9', name: "new.user@example.com's Organization", roleKey: 'administrator' }];
  return (path) => {
    if (path.endsWith('/auth/register')) return jsonResponse(REGISTER_OK, { status: 201 });
    if (path.endsWith('/auth/login')) return jsonResponse(LOGIN_OK);
    if (path.endsWith('/auth/me')) return jsonResponse(ME_OK);
    if (path.endsWith('/auth/organizations')) return jsonResponse(ORGS);
    throw new Error(`unexpected ${path}`);
  };
}

const SHORT_PASSWORD = 'Short1';
const NO_DIGIT = 'NoDigitsHere';
const NO_UPPER = 'all-lowercase-1';
const NO_LOWER = 'ALL-UPPERCASE-1';
const VALID = 'Correct-Horse-1';

beforeEach(() => {
  // Recording base stub, so a test can assert nothing was sent at all.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
  document.cookie = 'csrf_token=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSession();
});

describe('RegisterPage', () => {
  it('asks exactly email + password, with the password rule visible', () => {
    renderWithProviders(<RegisterPage />);

    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: false })).toBeInTheDocument();
    expect(screen.queryByLabelText(/organization/i)).toBeNull();
    expect(screen.getByText(PASSWORD_RULE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('shows each password rule failure inline and sends nothing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new.user@example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), SHORT_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Password must be at least 12 characters.')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.length).toBe(0);

    await user.clear(screen.getByLabelText('Password', { exact: false }));
    await user.type(screen.getByLabelText('Password', { exact: false }), NO_DIGIT);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('Password must include an uppercase letter, a lowercase letter and a digit.'),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Password', { exact: false }));
    await user.type(screen.getByLabelText('Password', { exact: false }), NO_UPPER);
    await user.clear(screen.getByLabelText('Password', { exact: false }));
    await user.type(screen.getByLabelText('Password', { exact: false }), NO_LOWER);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('Password must include an uppercase letter, a lowercase letter and a digit.'),
    ).toBeInTheDocument();
  });

  it('signals a rejected email inline before contacting the service', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'nope');
    await user.type(screen.getByLabelText('Password', { exact: false }), VALID);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.length).toBe(0);
  });

  it('registers, signs the new user in, and opens the shell', async () => {
    stubApi(envelopes());
    document.cookie = 'csrf_token=csrf-123;path=/';
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        {/* The new lander: registration success opens the shell at "/" with
            the session already signed in (the store holds the real identity). */}
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<p>the signed-in shell</p>} />
      </Routes>,
      { initialEntries: ['/register'] },
    );

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new.user@example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), VALID);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    // The shell is where registration lands, and the session is signed in.
    await waitFor(() => expect(screen.getByText('the signed-in shell')).toBeInTheDocument());
    expect(getSessionState().status).toBe('signed-in');
  });

  it('shows a non-validation failure with its request identifier instead of guessing', async () => {
    stubApi((path) => {
      if (path.endsWith('/auth/register')) {
        return jsonResponse(
          { code: 'INTERNAL_ERROR', message: 'Internal error.', details: [], requestId: 'reg-500' },
          { status: 500 },
        );
      }
      throw new Error(`unexpected ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'dup@example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), VALID);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/The account could not be created\./);
    expect(alert).toHaveTextContent('Internal error.');
    expect(alert).toHaveTextContent('reg-500');
  });
});
