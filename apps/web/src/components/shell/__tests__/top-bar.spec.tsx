import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test/render';
import { TopBar } from '../top-bar';

describe('TopBar (T077)', () => {
  it('labels the organization and the user even though neither exists yet', () => {
    renderWithProviders(<TopBar />);

    expect(screen.getByText('Organization:')).toBeVisible();
    expect(screen.getByText('Signed in as:')).toBeVisible();
  });

  it('renders the placeholders as inert status, not as controls that appear to work', () => {
    renderWithProviders(<TopBar />);

    // A dead control is worse than no control: it promises a business action.
    expect(screen.queryByRole('button', { name: /organization/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /user|signed in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('exposes neither placeholder as something a pointer can operate', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TopBar />);

    await user.tab();
    await user.tab();

    expect(screen.getByTestId('organization-placeholder')).not.toHaveFocus();
    expect(screen.getByTestId('user-placeholder')).not.toHaveFocus();
  });

  it('states that no organization is available rather than showing a blank or fabricated name', () => {
    renderWithProviders(<TopBar />);

    expect(screen.getByTestId('organization-placeholder')).toHaveTextContent(/none available yet/i);
    expect(screen.getByTestId('user-placeholder')).toHaveTextContent(/no user available yet/i);
  });
});