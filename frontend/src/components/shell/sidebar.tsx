import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import { Icon } from '../ui/icon';
import type { NavGroupName } from './navigation';
import { GROUP_LABEL_KEYS, NAVIGATION, NAV_LABEL_KEYS } from './navigation';
import { useSession } from '../../services/auth-session';
import { moduleForPath, isModuleEnabled } from './module-availability';
import { useCachedAttentionCount } from '../../features/overview/use-dashboard';

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
  const { t } = useTranslation();
  const session = useSession();
  const attentionCount = useCachedAttentionCount();

  const groupLabel = (name: NavGroupName) =>
    t(`shell.sidebar.groups.${GROUP_LABEL_KEYS[name]}`);
  const entryLabel = (label: string) =>
    NAV_LABEL_KEYS[label] !== undefined ? t(`shell.sidebar.entries.${NAV_LABEL_KEYS[label]}`) : label;

  return (
    <nav id="main-navigation" className={['app-shell__sidebar', className].filter(Boolean).join(' ')} aria-label={t('shell.sidebar.mainNav')}>
      <ul className="sidebar-nav">
        {NAVIGATION.map((group) => (
          <li key={group.name} className="sidebar-nav__group">
            <h2 className="sidebar-nav__group-label" id={groupLabelId(group.name)}>
              {groupLabel(group.name)}
            </h2>

            <ul className="sidebar-nav__group-list" aria-labelledby={groupLabelId(group.name)}>
              {group.entries.map((entry) => {
                const moduleKey = moduleForPath(entry.path ?? '');
                const disabledBySettings = moduleKey !== null && !isModuleEnabled(session, moduleKey);
                const translatedLabel = entryLabel(entry.label);
                return entry.state === 'available' && !disabledBySettings ? (
                  <li key={entry.label} className="sidebar-nav__attention">
                    <NavLink to={entry.path} end className="sidebar-nav__link" title={translatedLabel}>
                      <Icon name={entry.icon} />
                      <span className="sidebar-nav__label">{translatedLabel}</span>
                    </NavLink>
                    {entry.label === 'Overview' && attentionCount > 0 && (
                      <span className="sidebar-nav__badge" role="img" aria-label={`${translatedLabel}: ${attentionCount}`}>{attentionCount}</span>
                    )}
                  </li>
                ) : (
                  <li key={entry.label}>
                    <span
                      className="sidebar-nav__link"
                      data-state={disabledBySettings ? 'Unavailable' : 'Soon'}
                      aria-disabled="true"
                      title={disabledBySettings ? t('shell.sidebar.turnedOff') : entry.reason ?? undefined}
                    >
                      <Icon name={entry.icon} />
                      <span className="sidebar-nav__label">{translatedLabel}</span>
                      <span className="sidebar-nav__soon">{disabledBySettings ? t('shell.sidebar.unavailable') : t('shell.sidebar.soon')}</span>
                      <span className="sr-only"> - {disabledBySettings ? t('shell.sidebar.turnedOff') : entry.reason}</span>
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
