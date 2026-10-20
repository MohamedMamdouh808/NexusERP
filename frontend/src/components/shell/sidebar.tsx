import { NavLink } from 'react-router-dom';

import { Icon } from '../ui/icon';
import type { NavGroupName } from './navigation';
import { NAVIGATION } from './navigation';

/**
 * The persistent left sidebar (T025, FR-006 to FR-009).
 *
 * It renders `NAVIGATION` and nothing else, so the sidebar cannot offer a
 * destination the navigation list does not describe - and the list is the thing
 * the master-file comparison and the route test both check.
 *
 * The two forms of entry are different elements on purpose. An entry that is
 * available is a link, which is focusable, activatable and announceable. An entry
 * whose module is not built is not a link and not a button: it has no activation
 * path at all, because a control that does nothing when pressed teaches the user
 * that the working controls are unreliable too (FR-007). Its reason is carried
 * both as the tooltip the design system asks for and as text a screen reader
 * receives, since a `title` alone is not reliably announced.
 */

function groupLabelId(name: NavGroupName): string {
  return `nav-group-${name.toLowerCase().replace(/\s+/g, '-')}`;
}

export function Sidebar() {
  return (
    <nav className="app-shell__sidebar" aria-label="Main">
      <ul className="sidebar-nav">
        {NAVIGATION.map((group) => (
          <li key={group.name} className="sidebar-nav__group">
            <h2 className="sidebar-nav__group-label" id={groupLabelId(group.name)}>
              {group.name}
            </h2>

            <ul className="sidebar-nav__group-list" aria-labelledby={groupLabelId(group.name)}>
              {group.entries.map((entry) =>
                entry.state === 'available' ? (
                  <li key={entry.label}>
                    <NavLink to={entry.path} end className="sidebar-nav__link">
                      <Icon name={entry.icon} />
                      <span className="sidebar-nav__label">{entry.label}</span>
                    </NavLink>
                  </li>
                ) : (
                  <li key={entry.label}>
                    <span
                      className="sidebar-nav__link"
                      data-state="Soon"
                      aria-disabled="true"
                      title={entry.reason}
                    >
                      <Icon name={entry.icon} />
                      <span className="sidebar-nav__label">{entry.label}</span>
                      <span className="sidebar-nav__soon">Soon</span>
                      <span className="sr-only"> - {entry.reason}</span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
