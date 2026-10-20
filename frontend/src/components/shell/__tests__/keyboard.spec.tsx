import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../app-shell';
import { Breadcrumb } from '../breadcrumb';
import { PageHeader } from '../page-header';
import { renderWithProviders } from '../../../test/render';

describe('Shell keyboard navigation (T066, FR-044, FR-045)', () => {
  it('allows complete visual order tab navigation with visible focus', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell>
        <Breadcrumb />
        <PageHeader
          title="Dashboard Overview"
          primaryAction={<button type="button">Refresh Metrics</button>}
        />
        <p>Main content area</p>
      </AppShell>,
    );

    // Tab through interactive elements
    await user.tab(); // Skip link
    expect(screen.getByRole('link', { name: /Skip to main content/i })).toHaveFocus();

    await user.tab(); // Org switcher in topbar
    expect(screen.getByRole('button', { name: /Sample organization/i })).toHaveFocus();

    await user.tab(); // User menu in topbar
    expect(screen.getByRole('button', { name: /Preview user/i })).toHaveFocus();

    await user.tab(); // First available nav link (Overview)
    expect(screen.getByRole('link', { name: /Overview/i })).toHaveFocus();

    await user.tab(); // Second available nav link (System Health)
    expect(screen.getByRole('link', { name: /System Health/i })).toHaveFocus();

    await user.tab(); // Header action button
    expect(screen.getByRole('button', { name: 'Refresh Metrics' })).toHaveFocus();
  });
});
