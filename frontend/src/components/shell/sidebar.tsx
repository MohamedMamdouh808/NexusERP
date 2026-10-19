import { NavLink } from 'react-router-dom';

import { NAV_ITEMS } from './nav-items';

/**
 * Persistent left sidebar (T086). Always visible: the design system forbids a
 * hamburger substitution and forbids marketing links.
 *
 * The active item carries aria-current="page", which is what the design system
 * pairs with --color-primary for the active state.
 */
export function Sidebar() {
  return (
    <nav className="app-shell__sidebar" aria-label="Main">
      <ul className="sidebar-nav">
        <li className="sidebar-nav__group-label" aria-hidden="true">
          Workspace
        </li>
        {NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <NavLink to={item.path} end className="sidebar-nav__link">
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}