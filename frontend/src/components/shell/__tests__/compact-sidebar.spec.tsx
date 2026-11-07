import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Sidebar } from '../sidebar';
import { NAVIGATION } from '../navigation';
import { renderWithProviders } from '../../../test/render';

describe('Compact sidebar tablet responsiveness (T067, FR-011, FR-044)', () => {
  it('renders all navigation entries preserving accessible names and availability attributes in compact form', () => {
    renderWithProviders(<Sidebar />);

    // Each entry in NAVIGATION must have an accessible name and correct state/aria attributes
    for (const group of NAVIGATION) {
      for (const entry of group.entries) {
        if (entry.state === 'available') {
          const link = screen.getByRole('link', { name: new RegExp(entry.label, 'i') });
          expect(link).toBeInTheDocument();
        } else {
          // Soon entry
          const item = screen.getByText(entry.label);
          expect(item).toBeInTheDocument();
          const parent = item.closest('[data-state="Soon"]');
          expect(parent).toBeInTheDocument();
        }
      }
    }
  });

  it('keeps current destination identifiable via aria-current="page"', () => {
    renderWithProviders(<Sidebar />);

    const activeLink = screen.getByRole('link', { current: 'page' });
    expect(activeLink).toHaveTextContent(/Overview/i);
  });
});
