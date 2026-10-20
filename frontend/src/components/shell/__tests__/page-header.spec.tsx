import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test/render';
import { Breadcrumb } from '../breadcrumb';
import { PageHeader } from '../page-header';

/**
 * T022. The shell's chrome is where an interface quietly lies: a title row with a
 * button that does nothing, or a breadcrumb whose last crumb is a link to the page
 * the user is already on. Both are asserted here (FR-017, FR-018).
 */

/**
 * The design system publishes `.page-header` as the chrome's class name, so the
 * test finds it the way a reader of MASTER.md would. A role query would be
 * wrong here: inside the shell's `main` a `<header>` is not a banner landmark.
 */
function header(): HTMLElement {
  const element = document.querySelector('.page-header');

  expect(element, 'the page header must carry the published class').not.toBeNull();
  return element as HTMLElement;
}

describe('Page header (T022, FR-017)', () => {
  it('puts the title on the left and the primary action on the right', () => {
    renderWithProviders(
      <PageHeader title="Overview" primaryAction={<button type="button">Refresh</button>} />,
    );

    const title = within(header()).getByRole('heading', { level: 1, name: 'Overview' });
    const actions = header().querySelector('.page-header__actions');

    expect(actions).not.toBeNull();
    // DOM order is the reading order: the title block precedes the action block,
    // and the two are the header's only children.
    expect(header().firstElementChild).toContainElement(title);
    expect(header().lastElementChild).toBe(actions);
    expect(header().children).toHaveLength(2);
    expect(within(actions as HTMLElement).getByRole('button', { name: 'Refresh' })).toBeVisible();
  });

  it('renders a description and secondary actions alongside the primary one', () => {
    renderWithProviders(
      <PageHeader
        title="System Health"
        description="Live status of the application and its database."
        secondaryActions={[<button type="button">Copy report</button>]}
        primaryAction={<button type="button">Refresh</button>}
      />,
    );

    const description = screen.getByText('Live status of the application and its database.');
    expect(description).toHaveClass('page-header__description');

    const actions = header().querySelector('.page-header__actions') as HTMLElement;
    const rendered = within(actions).getAllByRole('button');

    expect(rendered.map((button) => button.textContent)).toEqual(['Copy report', 'Refresh']);
  });

  it('leaves the right side empty when the page has no primary action', () => {
    renderWithProviders(<PageHeader title="Overview" />);

    const actions = header().querySelector('.page-header__actions') as HTMLElement;

    expect(actions).not.toBeNull();
    expect(actions.children).toHaveLength(0);
    expect(within(actions).queryAllByRole('button')).toHaveLength(0);
    expect(within(actions).queryAllByRole('link')).toHaveLength(0);
    expect(actions.textContent).toBe('');
  });
});

describe('Breadcrumb (T022, FR-018)', () => {
  function breadcrumbAt(path: string): HTMLElement | null {
    renderWithProviders(<Breadcrumb />, { initialEntries: [path] });
    return screen.queryByRole('navigation', { name: 'Breadcrumb' });
  }

  it('names the current destination within the shell structure', () => {
    const nav = breadcrumbAt('/');

    expect(nav).not.toBeNull();
    expect(
      within(nav as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['General', 'Overview']);
  });

  it('follows the destination rather than repeating one fixed trail', () => {
    const nav = breadcrumbAt('/health');

    expect(
      within(nav as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Settings', 'System Health']);
  });

  it('marks the final entry as the current page without making it a link', () => {
    const nav = breadcrumbAt('/health') as HTMLElement;
    const crumbs = within(nav).getAllByRole('listitem');

    expect(crumbs[crumbs.length - 1]).toHaveClass('breadcrumb__current');
    expect(crumbs[crumbs.length - 1]).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryAllByRole('link')).toHaveLength(0);
  });

  it('never renders an entry as a link unless that destination exists', () => {
    const nowhere = breadcrumbAt('/no-such-screen');

    expect(nowhere).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
