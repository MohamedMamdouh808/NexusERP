import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '../ui/icon';
import type { NavGroupName } from './navigation';
import { NAVIGATION } from './navigation';
import { sampleCatalogService } from '../../services/sample-catalog-service';

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

export function Sidebar({ className }: { readonly className?: string } = {}) {
  const modules = useQuery({ queryKey: ['modules'], queryFn: () => sampleCatalogService.listModules() });
  return (
    <nav id="main-navigation" className={['app-shell__sidebar', className].filter(Boolean).join(' ')} aria-label="Main">
      <ul className="sidebar-nav">
        {NAVIGATION.map((group) => (
          <li key={group.name} className="sidebar-nav__group">
            <h2 className="sidebar-nav__group-label" id={groupLabelId(group.name)}>
              {group.name}
            </h2>

            <ul className="sidebar-nav__group-list" aria-labelledby={groupLabelId(group.name)}>
              {group.entries.map((entry) => {
                const moduleKey = entry.label === 'Inventory' ? 'inventory' : entry.label === 'Purchasing' ? 'purchasing' : entry.label === 'Sales Orders' ? 'sales' : entry.label === 'Invoicing' ? 'invoicing' : null;
                const disabledBySettings = moduleKey !== null && modules.data?.find((module) => module.key === moduleKey)?.enabled === false;
                return entry.state === 'available' && !disabledBySettings ? (
                  <li key={entry.label}>
                    <NavLink to={entry.path} end className="sidebar-nav__link" title={entry.label}>
                      <Icon name={entry.icon} />
                      <span className="sidebar-nav__label">{entry.label}</span>
                    </NavLink>
                  </li>
                ) : (
                  <li key={entry.label}>
                    <span
                      className="sidebar-nav__link"
                      data-state={disabledBySettings ? 'Unavailable' : 'Soon'}
                      aria-disabled="true"
                      title={disabledBySettings ? 'Turned off in Settings' : entry.reason ?? undefined}
                    >
                      <Icon name={entry.icon} />
                      <span className="sidebar-nav__label">{entry.label}</span>
                      <span className="sidebar-nav__soon">{disabledBySettings ? 'Unavailable' : 'Soon'}</span>
                      <span className="sr-only"> - {disabledBySettings ? 'Turned off in Settings' : entry.reason}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
