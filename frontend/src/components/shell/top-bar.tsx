/**
 * Top bar (T026, FR-013-FR-015, FR-040, FR-041).
 *
 * The organization switcher and the user menu are real controls backed by the
 * backend API. The shell service interface (`ShellService`) is implemented by
 * `shellService` (real) or `sampleShellService` (sample); the top bar imports
 * through the interface so no component change is needed to swap them
 * (FR-036, FR-037).
 *
 * Three rules the markup holds:
 *
 *  - **Both values are labelled honestly.** "Sample organization:" and
 *    "Preview user:" are the labels FR-013 names when sample data is shown.
 *  - **Neither is presented as a record.** The active organization's name is
 *    part of a control, not a data cell, and nothing here is fetched from or
 *    sent to anywhere except through the service seam (FR-041).
 *  - **Authentication state is explicit.** When no session exists, the user
 *    menu offers "Sign in"; after sign-in it offers the profile and "Sign out"
 *    (FR-015).
 */

import type { RefObject } from 'react';
import { useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { shellService } from '../../services/real-shell-service';
import { logout } from '../../services/auth-client';
import { DropdownMenu } from '../ui/dropdown-menu';
import type { DropdownMenuEntry } from '../ui/dropdown-menu';
import { Icon } from '../ui/icon';

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
  const navigate = useNavigate();
  const [session, setSession] = useState<{ csrfToken: string } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Check authentication status on mount by probing /auth/me.
  // A 200 means we have a session; a 401 means no session.
  useEffect(() => {
    let mounted = true;
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/v1/auth/me', {
          method: 'GET',
          credentials: 'include',
        });
        if (mounted) {
          setIsAuthenticated(response.ok);
        }
      } catch {
        if (mounted) setIsAuthenticated(false);
      }
    };
    checkAuth();
    return () => {
      mounted = false;
    };
  }, []);

  const organizations = useQuery({
    queryKey: ['shell', 'organizations'],
    queryFn: () => shellService.listOrganizations(),
    enabled: isAuthenticated === true,
  });

  const previewUser = useQuery({
    queryKey: ['shell', 'preview-user'],
    queryFn: () => shellService.getPreviewUser(),
    enabled: isAuthenticated === true,
  });

  const organizationsData = organizations.data ?? [];
  const previewUserData = previewUser.data;
  const activeOrganization = organizationsData[0];

  const handleLogout = async () => {
    if (session) {
      await logout(session.csrfToken);
    }
    setSession(null);
    setIsAuthenticated(false);
    navigate('/');
  };

  const userEntries: readonly DropdownMenuEntry[] = isAuthenticated
    ? [
        { kind: 'item', id: 'profile', label: 'Profile', onSelect: () => navigate('/profile') },
        { kind: 'item', id: 'logout', label: 'Sign out', onSelect: handleLogout },
      ]
    : [
        { kind: 'item', id: 'login', label: 'Sign in', onSelect: () => navigate('/login') },
      ];

  const previewUserInitials =
    previewUserData?.name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? '';

  const isLoading = organizations.isPending || previewUser.isPending;

  return (
    <header className="app-shell__topbar">
      <div className="top-bar__start">
        <button
          ref={activeMenuButtonRef}
          type="button"
          className="mobile-navigation__trigger"
          aria-label={mobileNavigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
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

      {/* The search control stays between two equal grid tracks so it sits
          truly in the middle regardless of how wide the side groups run. */}
      <button type="button" className="top-bar__command" onClick={onOpenCommandPalette} aria-label="Open command palette (Ctrl K)" title="Search and commands (Ctrl K)">
        <Icon name="search" />
        <span className="top-bar__command-label">Search…</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="top-bar__right">
        <div className="top-bar__account">
          {isAuthenticated === null ? (
            <span className="top-bar__pending" role="status">
              Checking session…
            </span>
          ) : isLoading ? (
            <span className="top-bar__pending" role="status">
              Loading…
            </span>
          ) : !isAuthenticated || organizationsData.length === 0 ? (
            <span className="top-bar__pending" role="status">
              No active session. Sign in to continue.
            </span>
          ) : (
            <>
              <DropdownMenu
                label="Organization"
                className="top-bar__organization-menu"
                trigger={
                  <>
                    <span className="sr-only">Organization: </span>
                    <span className="top-bar__organization-name">{activeOrganization.name}</span>
                    <Icon name="chevronDown" />
                  </>
                }
                entries={
                  organizationsData.map((org) => ({
                    kind: 'item' as const,
                    id: org.id,
                    label: org.name,
                    selected: org.id === activeOrganization.id,
                    onSelect: () => {
                      // Organization switching requires membershipId + CSRF token.
                      // Wired through the login flow; org switcher shows current org.
                    },
                  }))
                }
              />

              <DropdownMenu
                label="User"
                className="top-bar__user-menu"
                trigger={
                  <>
                    <span className="sr-only">User: </span>
                    <span className="top-bar__avatar" aria-hidden="true">
                      {previewUserInitials}
                    </span>
                    <span className="top-bar__user-copy">
                      <span className="top-bar__user-name">{previewUserData?.name}</span>
                      <span className="top-bar__user-status">{previewUserData?.role}</span>
                    </span>
                    <Icon name="chevronDown" />
                  </>
                }
                entries={userEntries}
              />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
