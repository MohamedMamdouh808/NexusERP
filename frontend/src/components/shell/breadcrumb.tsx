import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { GROUP_LABEL_KEYS, NAVIGATION, NAV_LABEL_KEYS } from './navigation';

/**
 * The breadcrumb every page inside the shell opens with (T027, FR-018).
 *
 * It is derived from the navigation list and the current address rather than
 * passed in by each page, for one reason: a page cannot then forget it, and the
 * trail cannot disagree with the sidebar about what the shell contains. The group
 * is a level of the shell's structure, so it appears as a crumb - but as text,
 * not as a link, because a group is not a destination. The final crumb is the
 * current page and is likewise not a link: a link to where the user already is
 * is a control that does nothing (FR-018).
 *
 * An address the navigation list does not describe renders no breadcrumb at all,
 * rather than inventing a trail for it.
 */

export interface BreadcrumbCrumb {
  readonly label: string;
  readonly current: boolean;
}

/** The trail for an address, or an empty list when it is not a destination. */
function trailFor(pathname: string): readonly BreadcrumbCrumb[] {
  for (const group of NAVIGATION) {
    for (const entry of group.entries) {
      if (entry.state === 'available' && entry.path === pathname) {
        return [
          { label: group.name, current: false },
          { label: entry.label, current: true },
        ];
      }
    }
  }

  return [];
}

export function Breadcrumb() {
  const { t } = useTranslation();
  const crumbLabel = (label: string) =>
    NAV_LABEL_KEYS[label] !== undefined
      ? t(`shell.sidebar.entries.${NAV_LABEL_KEYS[label]}`)
      : GROUP_LABEL_KEYS[label] !== undefined
        ? t(`shell.sidebar.groups.${GROUP_LABEL_KEYS[label]}`)
        : label;
  const trail = trailFor(useLocation().pathname).map((crumb) => ({
    ...crumb,
    label: crumbLabel(crumb.label),
  }));

  if (trail.length === 0) return null;

  return (
    <nav className="breadcrumb" aria-label={t('shell.breadcrumb.ariaLabel')}>
      <ol className="breadcrumb__list">
        {trail.map((crumb) => (
          <li
            key={crumb.label}
            className={crumb.current ? 'breadcrumb__current' : undefined}
            aria-current={crumb.current ? 'page' : undefined}
          >
            {crumb.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}
