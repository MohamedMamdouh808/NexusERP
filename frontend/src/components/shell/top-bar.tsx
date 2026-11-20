/**
 * Top bar (T026, FR-013-FR-015, FR-040, FR-041).
 *
 * The organization switcher and the user menu are real controls backed by the
 * backend session (`services/auth-session.ts` reads /auth/me and
 * /auth/organizations; components import through the session store and never
 * touch the transport). What the bar shows:
 *
 *  - **Signed out:** a single "Sign in" action. No pretend organization and no
 *    "not signed in" persona: an absent session is a fact, not a sample user.
 *  - **Signed in:** the real organization's name and the real user (their email
 *    and role). With one membership the organization is a text-only control;
 *    with more than one it becomes the switcher menu backed by the real switch
 *    endpoint. The menu refetches `/auth/me` and `/auth/organizations`
 *    afterwards instead of trusting the switch response, whose organization
 *    name is a documented backend defect (it echoes the id).
 */

import type { RefObject } from 'react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useTranslation } from 'react-i18next';

import { signOut, switchOrganizationForSession, useSession } from '../../services/auth-session';
import { roleLabel } from './role-label';
import { Button, DropdownMenu, Icon } from '../ui';

/** Two-letter initials off the email address - the user's own, never invented. */
function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  return local.slice(0, 2).toUpperCase();
}

interface TopBarProps {
  readonly menuButtonRef?: RefObject<HTMLButtonElement>;
  readonly mobileNavigationOpen?: boolean;
  readonly onMenuToggle?: () => void;
  readonly onOpenCommandPalette?: () => void;
}

export function TopBar({
  menuButtonRef,
  mobileNavigationOpen = false,
  onMenuToggle = () => {},
  onOpenCommandPalette = () => {},
}: TopBarProps = {}) {
  const fallbackMenuButtonRef = useRef<HTMLButtonElement>(null);
  const activeMenuButtonRef = menuButtonRef ?? fallbackMenuButtonRef;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const [switchFailure, setSwitchFailure] = useState<{
    readonly message: string;
    readonly requestId: string;
    readonly status?: number;
  } | null>(null);

  async function handleSignOut() {
    // The endpoint is a documented backend gap (403 for everyone), so the local
    // session is cleared regardless and the gate moves to the sign-in screen
    // either way.
    await signOut();
    navigate('/login');
  }

  async function handleSwitchOrganization(organizationId: string) {
    setSwitchFailure(null);
    const outcome = await switchOrganizationForSession(organizationId);
    if (!outcome.ok) {
      setSwitchFailure({ message: outcome.failure.message, requestId: outcome.failure.requestId, status: outcome.failure.status });
    }
  }

  const start = (
    <div className="top-bar__start">
      <button
        ref={activeMenuButtonRef}
        type="button"
        className="mobile-navigation__trigger"
        aria-label={mobileNavigationOpen ? t('shell.topBar.closeNavigationMenu') : t('shell.topBar.openNavigationMenu')}
        aria-expanded={mobileNavigationOpen}
        aria-controls="main-navigation"
        onClick={onMenuToggle}
      >
        <Icon name={mobileNavigationOpen ? 'close' : 'menu'} />
      </button>

      <span className="top-bar__brand">
        <svg className="top-bar__logomark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--color-primary)" />
          <rect x="7" y="7" width="8" height="8" rx="2" fill="var(--color-on-primary)" />
          <rect x="17" y="7" width="8" height="8" rx="2" fill="var(--color-secondary)" />
          <rect x="7" y="17" width="8" height="8" rx="2" fill="var(--color-secondary)" />
          <rect x="17" y="17" width="8" height="8" rx="2" fill="var(--color-on-primary)" />
        </svg>
        <span>NexusERP</span>
      </span>
    </div>
  );

  const command = (
    <button
      type="button"
      className="top-bar__command"
      onClick={onOpenCommandPalette}
      aria-label={t('shell.topBar.commandPaletteAria')}
      title={t('shell.topBar.commandPaletteTitle')}
    >
      <Icon name="search" />
      <span className="top-bar__command-label">{t('shell.topBar.search')}</span>
      <kbd>Ctrl K</kbd>
    </button>
  );

  if (session.status !== 'signed-in') {
    return (
      <header className="app-shell__topbar">
        {start}
        {command}
        <div className="top-bar__right">
          <div className="top-bar__account">
            <Button variant="secondary" onClick={() => navigate('/login')}>
              {t('shell.topBar.signIn')}
            </Button>
          </div>
        </div>
      </header>
    );
  }

  const { user, organization, organizations, membership } = session;
  const canSwitch = organizations.length > 1;

  // Single-organization members see nothing here: the account menu names the
  // organization, so a static label would be noise. Multi-organization
  // members keep the switcher (it is the only way to switch).
  const organizationControl = canSwitch ? (
    <DropdownMenu
      label={t('shell.topBar.organizationMenuLabel')}
      className="top-bar__organization-menu"
      trigger={
        <>
          <span className="sr-only">{t('shell.topBar.organizationAria')}</span>
          <span className="top-bar__organization-name">{organization.name}</span>
          <Icon name="chevronDown" />
        </>
      }
      entries={organizations.map((entry) => ({
        kind: 'item' as const,
        id: entry.id,
        label: entry.name,
        selected: entry.id === organization.id,
        onSelect: () => {
          void handleSwitchOrganization(entry.id);
        },
      }))}
    />
  ) : null;

  const userControl = (
    <DropdownMenu
      label={t('shell.topBar.userMenuLabel')}
      className="top-bar__user-menu"
      trigger={
        <>
          <span className="sr-only">{t('shell.topBar.userAria')}</span>
          <span className="top-bar__avatar" aria-hidden="true">
            {initialsFromEmail(user.email)}
          </span>
          <span className="top-bar__user-copy">
            <span className="top-bar__user-name">{user.email}</span>
            <span className="top-bar__user-status">{roleLabel(membership.roles)}</span>
          </span>
          <Icon name="chevronDown" />
        </>
      }
      entries={[
        { kind: 'header', id: 'organization', label: organization.name },
        { kind: 'item', id: 'profile', label: t('shell.topBar.profile'), onSelect: () => navigate('/profile') },
        {
          kind: 'item',
          id: 'sign-out',
          label: t('shell.topBar.signOut'),
          onSelect: () => {
            void handleSignOut();
          },
        },
      ]}
    />
  );

  return (
    <header className="app-shell__topbar">
      {start}
      {command}
      <div className="top-bar__right">
        <div className="top-bar__account">
          {switchFailure !== null && (
            <span className="top-bar__switch-failure" role="alert">
              {switchFailure.message}
              <code>
                {' '}
                {t('ui.errorState.referenceLabel')}
                {switchFailure.requestId} · HTTP {switchFailure.status}
              </code>
            </span>
          )}
          {organizationControl}
          {userControl}
        </div>
      </div>
    </header>
  );
}
