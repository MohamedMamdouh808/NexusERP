import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '../../../test/render';
import { resetSession } from '../../../test/session';
import { jsonResponse } from '../../../test/render';
import { ChangePasswordScreen } from '../change-password-screen';

const ME_SIGNED_IN = {
  user: { id: 'user-1', email: 'nora@example.com', mustChangePassword: false },
  membership: {
    id: 'membership-1',
    roles: [{ id: 'role-1', key: 'administrator', name: 'Administrator' }],
    isActive: true,
  },
  organization: { id: 'org-1', name: "Nora's Organization" },
};

const ORGANIZATIONS = [
  {
    id: 'org-1',
    name: "Nora's Organization",
    roles: [{ id: 'role-1', key: 'administrator', name: 'Administrator' }],
  },
];

/**
 * The forced password change (FR-006, FR-007, FR-028).
 *
 * The service refuses every capability except the password change while the
 * account still has the temporary password an administrator gave it. The screen
 * has to:
 *
 *  - enforce the service's own policy before sending anything;
 *  - send the current and the new password;
 *  - show what the service said, with its request identifier.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  resetSession();
});

describe('ChangePasswordScreen', () => {
  it('refuses a new password that breaks the policy, without calling the service', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderWithProviders(<ChangePasswordScreen email="member@example.test" />);

    await user.type(screen.getByLabelText(/Temporary password/), 'Temporary1234');
    await user.type(screen.getByLabelText(/^New password/), 'short');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'short');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(
      await screen.findByText('New password must be at least 12 characters long.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses two different passwords, without calling the service', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderWithProviders(<ChangePasswordScreen email="member@example.test" />);

    await user.type(screen.getByLabelText(/Temporary password/), 'Temporary1234');
    await user.type(screen.getByLabelText(/^New password/), 'BrandNewPass123');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'BrandNewPass124');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the change and reports the service failure with its reference', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'The current password is incorrect.',
          details: [],
          requestId: 'req-change-1',
        },
        { status: 400 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderWithProviders(<ChangePasswordScreen email="member@example.test" />);

    await user.type(screen.getByLabelText(/Temporary password/), 'Temporary1234');
    await user.type(screen.getByLabelText(/^New password/), 'BrandNewPass123');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'BrandNewPass123');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByText('The current password is incorrect.')).toBeInTheDocument();
    expect(screen.getByText('req-change-1')).toBeInTheDocument();

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain('/auth/change-password');
    expect(String(call[1]?.body)).toContain('BrandNewPass123');
  });

  it('names the account it is changing the password for', () => {
    renderWithProviders(<ChangePasswordScreen email="member@example.test" />);
    expect(screen.getByText(/member@example\.test/)).toBeInTheDocument();
  });
});

describe('a signed-in account with a pending password change', () => {
  it('shows the change screen instead of the shell', async () => {
    // The probe answers with an account that still has to choose a password.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith('/auth/me')) {
          return jsonResponse({
            ...ME_SIGNED_IN,
            user: { ...ME_SIGNED_IN.user, mustChangePassword: true },
          });
        }
        if (path.endsWith('/auth/organizations')) return jsonResponse(ORGANIZATIONS);
        throw new Error(`unexpected ${path}`);
      }),
    );

    const { SessionGate } = await import('../session-gate');
    renderWithProviders(
      <SessionGate>
        <p>shell content</p>
      </SessionGate>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Choose your password' })).toBeInTheDocument(),
    );
    expect(screen.queryByText('shell content')).toBeNull();
  });
});
