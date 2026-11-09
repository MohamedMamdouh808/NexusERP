import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../app-shell';
import { Breadcrumb } from '../breadcrumb';
import { PageHeader } from '../page-header';
import { renderWithProviders } from '../../../test/render';
import { seedSignedInSession, TEST_ORGANIZATION, TEST_ORGANIZATION_TWO } from '../../../test/session';

describe('Shell keyboard navigation (T066, FR-044, FR-045)', () => {
  it('allows complete visual order tab navigation with visible focus', async () => {
    const user = userEvent.setup();
    // Two memberships, so the organization control in the top bar is the real
    // switcher menu (a single membership renders as text, not a control).
    seedSignedInSession({
      organizations: [TEST_ORGANIZATION, TEST_ORGANIZATION_TWO],
    });
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

    await user.tab(); // Mobile navigation trigger (hidden visually above the phone breakpoint)
    expect(screen.getByRole('button', { name: /Open navigation menu/i })).toHaveFocus();

    await user.tab(); // Command-palette trigger (Ctrl + K also opens it)
    expect(screen.getByRole('button', { name: /Open command palette/i })).toHaveFocus();

    await user.tab(); // Org switcher in topbar (two seeded memberships)
    expect(screen.getByRole('button', { name: /Organization:/i })).toHaveFocus();

    await user.tab(); // User menu in topbar
    expect(screen.getByRole('button', { name: /User:/i })).toHaveFocus();

    await user.tab(); // First available nav link (Overview)
    expect(screen.getByRole('link', { name: /Overview/i })).toHaveFocus();

    await user.tab(); // Sales Orders
    expect(screen.getByRole('link', { name: /Sales Orders/i })).toHaveFocus();

    await user.tab(); // Inventory
    expect(screen.getByRole('link', { name: /Inventory/i })).toHaveFocus();

    await user.tab(); // Reports
    expect(screen.getByRole('link', { name: /Reports/i })).toHaveFocus();

    await user.tab(); // Products
    expect(screen.getByRole('link', { name: /Products/i })).toHaveFocus();

    await user.tab(); // Customers & Suppliers
    expect(screen.getByRole('link', { name: /Customers & Suppliers/i })).toHaveFocus();

    await user.tab(); // Purchasing
    expect(screen.getByRole('link', { name: /Purchasing/i })).toHaveFocus();

    await user.tab(); // Invoicing
    expect(screen.getByRole('link', { name: /Invoicing/i })).toHaveFocus();

    await user.tab(); // Users & Roles
    expect(screen.getByRole('link', { name: /Users & Roles/i })).toHaveFocus();

    await user.tab(); // Organization
    expect(screen.getByRole('link', { name: /Organization/i })).toHaveFocus();

    await user.tab(); // Audit Log
    expect(screen.getByRole('link', { name: /Audit Log/i })).toHaveFocus();

    await user.tab(); // System Health
    expect(screen.getByRole('link', { name: /System Health/i })).toHaveFocus();
    await user.tab(); // Header action button
    expect(screen.getByRole('button', { name: 'Refresh Metrics' })).toHaveFocus();
  });
});
