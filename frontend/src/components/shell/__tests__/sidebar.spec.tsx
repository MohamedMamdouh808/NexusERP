import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test/render';
import { NAVIGATION } from '../navigation';
import { Sidebar } from '../sidebar';

/**
 * T020. The sidebar is where the product is most tempted to lie: a link to a
 * module that does not exist looks exactly like a link to one that does, and the
 * user only finds out by clicking. So this suite asserts the two halves
 * separately - what is offered as reachable, and what is offered as unavailable
 * and honest about it (FR-006 to FR-009, FR-067, SC-016).
 */

const GROUP_NAMES = ['General', 'Management', 'Settings'];

const ALL_ENTRIES = NAVIGATION.flatMap((group) => group.entries);

function mainNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Main' });
}

function renderSidebar(path = '/'): void {
  renderWithProviders(<Sidebar />, { initialEntries: [path] });
}

describe('Sidebar structure (T020, FR-006)', () => {
  it('renders exactly the three groups of the master file, in order, each labelled', () => {
    renderSidebar();

    const headings = within(mainNav())
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual(GROUP_NAMES);
  });

  it('renders every entry of the navigation list, in order, under its own group', () => {
    renderSidebar();

    const nav = mainNav();
    const rendered = [...nav.querySelectorAll('.sidebar-nav__label')].map(
      (label) => label.textContent,
    );

    expect(rendered).toEqual(ALL_ENTRIES.map((entry) => entry.label));

    for (const group of NAVIGATION) {
      const list = within(nav).getByRole('list', { name: group.name });
      const labels = [...list.querySelectorAll('.sidebar-nav__label')].map(
        (label) => label.textContent,
      );

      expect(labels, `${group.name} must hold its own entries`).toEqual(
        group.entries.map((entry) => entry.label),
      );
    }
  });

  it('never renders a group empty', () => {
    renderSidebar();

    for (const group of NAVIGATION) {
      expect(group.entries.length, `${group.name} must hold at least one entry`).toBeGreaterThan(0);
      expect(within(mainNav()).getByRole('list', { name: group.name })).toBeInTheDocument();
    }
  });
});

describe('Sidebar reachability (T020, FR-007, FR-009, SC-016)', () => {
  it('offers exactly two links, and they are the two available destinations', () => {
    renderSidebar();

    const links = within(mainNav()).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual(['Overview', 'System Health']);
    expect(ALL_ENTRIES.filter((entry) => entry.state === 'available')).toHaveLength(2);
  });

  it('marks the entry for the current destination as the page, and nothing else', () => {
    renderSidebar('/');

    const nav = mainNav();
    const current = within(nav).getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('Overview');
    // Nothing but the current destination carries the attribute - not a group, not
    // an unavailable entry, not the other link.
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('moves the current-page mark to System Health on its own destination', () => {
    renderSidebar('/health');

    const current = within(mainNav()).getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('System Health');
  });
});

describe('Sidebar honesty (T020, FR-007, FR-008)', () => {
  const unavailable = ALL_ENTRIES.filter((entry) => entry.state === 'Soon');

  it('renders every unbuilt module as unavailable, in place, with its reason', () => {
    renderSidebar();

    expect(unavailable.length).toBeGreaterThan(0);

    for (const entry of unavailable) {
      const rendered = screen.getByTitle(entry.reason);

      expect(rendered).toHaveAttribute('data-state', 'Soon');
      expect(rendered).toHaveAttribute('aria-disabled', 'true');
      expect(rendered.textContent).toContain(entry.label);
      expect(rendered.textContent).toContain('Soon');
      expect(rendered.textContent, 'the reason must reach assistive technology').toContain(
        entry.reason,
      );
    }
  });

  it('gives an unavailable entry no activation path at all', () => {
    renderSidebar();

    const entry = unavailable[0];
    const rendered = screen.getByTitle(entry.reason);

    // Not a link and not a button: there is nothing to activate, and no handler
    // that would silently do nothing.
    expect(within(rendered).queryByRole('link')).toBeNull();
    expect(within(mainNav()).queryByRole('link', { name: new RegExp(entry.label) })).toBeNull();
    expect(within(mainNav()).queryByRole('button', { name: new RegExp(entry.label) })).toBeNull();
    expect(rendered.closest('a')).toBeNull();
    expect(rendered.closest('button')).toBeNull();
  });

  it('never puts the keyboard on an unavailable entry', async () => {
    const user = userEvent.setup();
    renderSidebar();

    const rendered = unavailable.map((entry) => screen.getByTitle(entry.reason));

    for (let press = 0; press < 6; press += 1) {
      await user.tab();
      for (const element of rendered) {
        expect(element).not.toHaveFocus();
        expect(element.contains(document.activeElement)).toBe(false);
      }
    }
  });

  it('changes nothing when an unavailable entry is clicked', async () => {
    const user = userEvent.setup();
    renderSidebar();

    const before = document.body.innerHTML;
    await user.click(screen.getByTitle(unavailable[0].reason));

    expect(document.body.innerHTML).toBe(before);
    expect(within(mainNav()).getAllByRole('link', { current: 'page' })[0].textContent).toBe(
      'Overview',
    );
  });
});

describe('Sidebar omissions (T020, FR-016, FR-067, SC-016)', () => {
  it('renders no surface that belongs to no v1 feature', () => {
    renderSidebar();

    const nav = mainNav();
    const omitted =
      /\b(billing|subscription|integrations?|upgrade|help|support|search|notifications?)\b/i;

    expect(nav.textContent ?? '').not.toMatch(omitted);
    expect(within(nav).queryByRole('searchbox')).toBeNull();
    expect(within(nav).queryByRole('search')).toBeNull();
    expect(within(nav).queryAllByRole('textbox')).toHaveLength(0);
  });
});
