import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test/render';
import { seedSignedInSession, TEST_ORGANIZATION } from '../../../test/session';
import { TopBar } from '../top-bar';

/**
 * The account menu: the first row names the organization the signed-in
 * user is acting in, as a label, so it is never a trap for keyboard or
 * screen-reader users. The two actions below it (Profile, Sign out) are
 * the only focusable rows.
 */
describe('TopBar account menu', () => {
  it('shows the organization name as the first, non-interactive row', async () => {
    seedSignedInSession({ organization: TEST_ORGANIZATION });
    const user = userEvent.setup();
    renderWithProviders(<TopBar />);

    await user.click(screen.getByRole('button', { name: /User:/ }));

    const menu = screen.getByRole('menu', { name: 'User' });

    // The organization row: present, the full name, above the actions.
    expect(within(menu).getByText('Test Organization (One)')).toBeInTheDocument();

    // Exactly two focusable actions: Profile and Sign out.
    const focusable = within(menu)
      .getAllByRole('menuitem')
      .map((el) => el.textContent);
    expect(focusable).toEqual(['Profile', 'Sign out']);

    // Focus is inside the menu, on the first actionable row — Profile.
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveFocus();

    // One arrow down reaches Sign out; the organization row is never reachable.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveFocus();
  });

  it('keeps the organization name out of the focus order and of the activation path', async () => {
    seedSignedInSession({ organization: TEST_ORGANIZATION });
    const user = userEvent.setup();
    renderWithProviders(<TopBar />);

    await user.click(screen.getByRole('button', { name: /User:/ }));
    const menu = screen.getByRole('menu', { name: 'User' });

    // The header row is not a menuitem at all.
    expect(within(menu).queryByRole('menuitem', { name: /Organization/i })).not.toBeInTheDocument();
    // Clicking it performs no navigation and does not close the menu.
    await user.click(within(menu).getByText('Test Organization (One)'));
    expect(screen.getByRole('menu', { name: 'User' })).toBeInTheDocument();
  });

  it('truncates a very long organization name to one line with the full name kept for hover', async () => {
    const longName = 'A'.repeat(120) + ' Industries International Logistics Holding Company';
    seedSignedInSession({ organization: { ...TEST_ORGANIZATION, name: longName } });
    const user = userEvent.setup();
    renderWithProviders(<TopBar />);

    await user.click(screen.getByRole('button', { name: /User:/ }));
    const menu = screen.getByRole('menu', { name: 'User' });
    const header = within(menu).getByText(longName);

    // One line, clipped with ellipsis; the full name is on the title attribute.
    expect(header).toHaveClass('menu__header-label');
    expect(header).toHaveAttribute('title', longName);

    // The actions below it remain the only focusable rows.
    const focusable = within(menu).getAllByRole('menuitem').map((el) => el.textContent);
    expect(focusable).toEqual(['Profile', 'Sign out']);
  });
});
