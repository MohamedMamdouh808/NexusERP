import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test/render';
import { TopBar } from '../top-bar';

/**
 * T021. The top bar is the one place in every build where sample data is on
 * screen (FR-040), so it is the place where a fabrication would be most
 * convincing. These assertions are about what it must NOT be: not a record, not
 * a real organization, not carried in the address, and not a session.
 */

/**
 * Reports the address the shell is on. FR-014 requires that selecting a sample
 * organization changes only what the shell displays, so the address has to be
 * observable from inside the router rather than assumed.
 */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

async function renderTopBar() {
  const user = userEvent.setup();
  const view = renderWithProviders(
    <>
      <TopBar />
      <LocationProbe />
    </>,
  );

  // Both values arrive through the service seam, so the first paint is pending
  // rather than a name written into the markup (FR-041).
  await screen.findByRole('button', { name: /^Sample organization:/ });

  return { user, ...view };
}

describe('TopBar (T077)', () => {
  it('labels the organization and the person as sample rather than showing a bare name', async () => {
    await renderTopBar();

    expect(screen.getByRole('button', { name: /^Sample organization:/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /^Preview user:/ })).toBeVisible();
  });

  it('carries the visible "Sample data" marker the whole top bar falls under', async () => {
    await renderTopBar();

    expect(screen.getByText('Sample data')).toBeVisible();
  });

  it('presents neither value as a record', async () => {
    const { container } = await renderTopBar();

    expect(container.querySelector('table, dl, [role="table"], [role="grid"]')).toBeNull();
    // The active organization's name is part of a control, not a data cell.
    expect(
      screen.getByRole('button', { name: /^Sample organization: Sample Organization \(Alpha\)/ }),
    ).toBeVisible();
  });

  it('keeps the active sample organization visible at all times', async () => {
    await renderTopBar();

    expect(
      screen.getByRole('button', { name: /^Sample organization: Sample Organization \(Alpha\)/ }),
    ).toBeVisible();
  });

  it('switches the active organization in place, without putting it in the address', async () => {
    const { user } = await renderTopBar();

    expect(screen.getByTestId('location').textContent).toBe('/');

    await user.click(screen.getByRole('button', { name: /^Sample organization:/ }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Sample Organization (Beta)' }),
    );

    expect(
      screen.getByRole('button', { name: /^Sample organization: Sample Organization \(Beta\)/ }),
    ).toBeVisible();
    // FR-014: the switch changes what the shell displays and nothing else.
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('offers only sample organizations to switch between', async () => {
    const { user } = await renderTopBar();

    await user.click(screen.getByRole('button', { name: /^Sample organization:/ }));

    const choices = await screen.findAllByRole('menuitemradio');
    expect(choices.map((choice) => choice.textContent)).toEqual([
      'Sample Organization (Alpha)',
      'Sample Organization (Beta)',
    ]);
    // Exactly one organization is the active one at any time.
    expect(choices.filter((choice) => choice.getAttribute('aria-checked') === 'true')).toHaveLength(
      1,
    );
  });

  it('renders the user-menu entries that would need a session as disabled, with the reason', async () => {
    const { user } = await renderTopBar();

    await user.click(screen.getByRole('button', { name: /^Preview user:/ }));

    const entries = await screen.findAllByRole('menuitem');
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry).toHaveAttribute('aria-disabled', 'true');
      expect(entry).toHaveTextContent(/authentication is not part of this feature/i);
    }
  });

  it('offers no control, link or wording implying a session exists', async () => {
    const { container, user } = await renderTopBar();

    await user.click(screen.getByRole('button', { name: /^Preview user:/ }));

    // A sign-in or sign-out affordance would be a link or a control; there is
    // neither, and no route to one (FR-015).
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(/\b(sign in|log in|sign out|log out)\b/i);
    }
    expect(container.textContent ?? '').not.toMatch(/\b(sign in|log in|sign out|log out)\b/i);
  });

  it('renders neither global search nor notifications, in any form', async () => {
    const { container } = await renderTopBar();

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /search/i })).not.toBeInTheDocument();
    expect(within(container).queryByText(/notification/i)).not.toBeInTheDocument();
  });
});
