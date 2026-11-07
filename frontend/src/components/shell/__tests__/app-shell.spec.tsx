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

  it('provides a mobile navigation trigger while keeping navigation in the shell', () => {
    renderWithProviders(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toBeInTheDocument();
  });

  it('locks background scrolling while the mobile drawer is open and closes on overlay activation', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell>
        <p>content marker</p>
      </AppShell>,
    );

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('button', { name: /close navigation menu/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close navigation menu/i }));
    expect(document.body.style.overflow).toBe('');
  });

  it('closes the mobile drawer after navigation and on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell>
        <p>content marker</p>
      </AppShell>,
    );

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('link', { name: 'System Health' }));
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute('aria-expanded', 'false');
  });
});
