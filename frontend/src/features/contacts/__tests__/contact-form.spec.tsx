import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '../../../test/render';
import { jsonResponse } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';
import { ContactNewPage } from '../contact-new-page';

/**
 * The contact form.
 *
 * The rules the form enforces before it calls the service are the service's
 * own: a contact needs a name, at least one role, and a well-formed email
 * address if it has one at all. A form that sends a body the service will
 * refuse only teaches the user an error message they could have been spared.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  resetSession();
});

describe('the contact form', () => {
  it('refuses an empty name and sends nothing', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    seedSignedInSession();
    renderWithProviders(<ContactNewPage />);

    await user.click(screen.getByRole('button', { name: 'Create Contact' }));

    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a contact with no role and sends nothing', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    seedSignedInSession();
    renderWithProviders(<ContactNewPage />);

    await user.type(screen.getByLabelText(/^Name/), 'Acme Corp');
    await user.click(screen.getByRole('checkbox', { name: 'Customer' }));
    await user.click(screen.getByRole('button', { name: 'Create Contact' }));

    expect(await screen.findByText('Select at least one role.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a malformed email address and sends nothing', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    seedSignedInSession();
    renderWithProviders(<ContactNewPage />);

    await user.type(screen.getByLabelText(/^Name/), 'Acme Corp');
    await user.type(screen.getByLabelText(/^Email/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Create Contact' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the contact and moves to it', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init: RequestInit = {}) =>
      jsonResponse({ id: 'contact-1', code: 'CUST-00001' }, { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    seedSignedInSession();
    renderWithProviders(<ContactNewPage />);

    await user.type(screen.getByLabelText(/^Name/), 'Acme Corp');
    await user.click(screen.getByRole('button', { name: 'Create Contact' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(String(init.body)).toContain('Acme Corp');
  });

  it('shows the service\'s refusal with its reference, not a generic message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            code: 'DUPLICATE_RECORD',
            message: 'A contact with this email already exists.',
            details: [],
            requestId: 'req-dup-1',
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();

    seedSignedInSession();
    renderWithProviders(<ContactNewPage />);

    await user.type(screen.getByLabelText(/^Name/), 'Acme Corp');
    await user.click(screen.getByRole('button', { name: 'Create Contact' }));

    expect(
      await screen.findByText('A contact with this email already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByText('req-dup-1')).toBeInTheDocument();
  });

  it('offers no form to a caller without contacts.write', async () => {
    seedSignedInSession({ permissions: ['contacts.read'] });

    renderWithProviders(<ContactNewPage />);

    expect(
      await screen.findByText('You do not have permission to create contacts.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Contact' })).toBeNull();
  });
});
