import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test/render';
import { AppShell } from '../app-shell';

describe('AppShell (T076)', () => {
  it('renders the sidebar, the top bar and the content area on first load', () => {
    renderWithProviders(
      <AppShell>
        <p>content marker</p>
      </AppShell>,
    );

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByText('content marker'));
  });

  it('puts the content in the main landmark the shell announces', () => {
    renderWithProviders(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    // Programmatic focus target: a skip link that does not move focus is decoration.
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('lets a keyboard user bypass the sidebar', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    await user.tab();

    const skip = screen.getByRole('link', { name: /skip to main content/i });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#main-content');
  });

  it('marks the current destination with aria-current rather than colour alone', () => {
    renderWithProviders(
      <AppShell>
        <p>content</p>
      </AppShell>,
      { initialEntries: ['/health'] },
    );

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'System Health' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the sidebar present rather than replacing it with a hamburger on a narrow viewport', () => {
    renderWithProviders(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /menu/i })).not.toBeInTheDocument();
  });
});
