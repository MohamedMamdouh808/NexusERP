import { screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { routes } from '../../../app/router';
import { renderWithProviders } from '../../../test/render';
import { AppShell } from '../app-shell';
import { NAVIGATION } from '../navigation';

/**
 * T078. A control that implies a business action the platform cannot perform is a
 * lie told in the interface: the user presses it, nothing happens, and they stop
 * trusting the ones that do work. This suite is the guard against that, and it is
 * separate from the shell render test because it asserts an absence.
 */
describe('No control implying an unavailable business action (T078)', () => {
  const businessVerbs =
    /\b(new|create|add|edit|delete|save|submit|post|approve|void|purchase|checkout|export|import)\b/i;

  it('offers no button that claims a business action', () => {
    renderWithProviders(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    for (const button of screen.queryAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(businessVerbs);
    }
  });

  it('offers no navigation entry that is not a route the application serves', () => {
    for (const group of NAVIGATION) {
      for (const item of group.entries) {
        if (item.state === 'available') {
          const router = createMemoryRouter(routes, { initialEntries: [item.path] });
          const matched = router.state.matches.at(-1);

          expect(matched, `${item.path} must resolve`).toBeDefined();
          // '*' is the catch-all that redirects home: reaching it means the entry
          // advertised a destination the application does not have.
          expect(matched?.route.path, `${item.path} must not fall through to the catch-all`).toBe(
            item.path,
          );
        }
      }
    }
  });

  it('links nowhere outside the application', () => {
    renderWithProviders(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    for (const link of screen.getAllByRole('link')) {
      const href = link.getAttribute('href') ?? '';
      expect(href).not.toMatch(/^https?:\/\//);
      expect(href).not.toMatch(/^(mailto|tel):/);
    }
  });

  it('carries no marketing vocabulary and no sign-in entry', () => {
    renderWithProviders(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    const marketing =
      /\b(pricing|plans|features|testimonials|blog|demo|contact sales|get started|sign up|sign in|log in|free trial)\b/i;

    for (const group of NAVIGATION) {
      for (const item of group.entries) {
        expect(item.label).not.toMatch(marketing);
      }
    }

    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.textContent ?? '').not.toMatch(marketing);
    }
  });

  it('shows only the destinations this feature can actually serve', () => {
    // The design system groups the sidebar by module. Everything outside the two
    // working destinations belongs to a later feature and must not appear yet.
    const availablePaths = NAVIGATION.flatMap((g) => g.entries)
      .filter((e) => e.state === 'available')
      .map((e) => e.path);
    expect(availablePaths).toEqual(['/', '/health']);
  });

  it('records the permission each destination will require, without filtering on one yet', () => {
    for (const group of NAVIGATION) {
      for (const item of group.entries) {
        expect(item).toHaveProperty('permission');
      }
    }
  });
});
