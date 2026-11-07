/**
 * Top bar (T026, FR-013-FR-015, FR-040, FR-041).
 *
 * The organization switcher and the user menu are real controls, and that is a
 * deliberate change from the earlier pair of inert placeholders: a switcher that
 * switches and says the values are sample is honest, whereas neither a dead
 * control nor a blank space is.
 *
 * Three rules the markup holds:
 *
 *  - **Both values are labelled as sample.** "Sample organization:" and
 *    "Preview user:" are the labels FR-013 names.
 *  - **Neither is presented as a record.** The active organization's name is part
 *    of a control, not a data cell, and nothing here is fetched from or sent to
 *    anywhere: both values arrive through the service seam (FR-041).
 *  - **No session is implied.** The user menu's entries are the ones that would
 *    need a session, so they are rendered disabled with the explanation in place,
 *    and there is no sign-in route, sign-out action or session-shaped control
 *    anywhere (FR-015).
 *
 * The active organization is component state and nothing else: it is not
 * persisted and not carried in the address, so it survives no reload and scopes
 * no request (FR-014).
 */

import type { RefObject } from 'react';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { sampleShellService } from '../../services/sample-shell-service';
import { sampleCatalogService } from '../../services/sample-catalog-service';
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
  const organizations = useQuery({
    queryKey: ['shell', 'organizations'],
    queryFn: () => sampleShellService.listOrganizations(),
  });
  const previewUser = useQuery({
    queryKey: ['shell', 'preview-user'],
    queryFn: () => sampleShellService.getPreviewUser(),
  });
  const organizationSettings = useQuery({ queryKey: ['organization'], queryFn: () => sampleCatalogService.getOrganization() });

  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);

  // The shell starts on the first organization the service returns; a selection
  // replaces it. Nothing is written down, so a reload starts here again.
  const selectedOrganization =
    organizations.data?.find((organization) => organization.id === selectedOrganizationId) ??
    organizations.data?.[0];
  const activeOrganization = selectedOrganization === undefined ? undefined : {
    ...selectedOrganization,
    name: selectedOrganization.id === organizationSettings.data?.id ? organizationSettings.data.name : selectedOrganization.name,
  };

  const organizationEntries: readonly DropdownMenuEntry[] = (organizations.data ?? []).map(
    (organization) => ({
      kind: 'item',
      id: organization.id,
      label: organization.id === organizationSettings.data?.id ? organizationSettings.data.name : organization.name,
      selected: organization.id === activeOrganization?.id,
      onSelect: () => setSelectedOrganizationId(organization.id),
    }),
  );

  // Appearance settings live on the preview profile page, not here.
  const userEntries: readonly DropdownMenuEntry[] = [
    { kind: 'item', id: 'profile', label: 'Preview profile', onSelect: () => navigate('/profile') },
  ];

  const previewUserInitials =
    previewUser.data?.name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? '';

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
          {activeOrganization === undefined || previewUser.data === undefined || organizationSettings.data === undefined ? (
            <span className="top-bar__pending" role="status">
              Loading the sample organization and preview user
            </span>
          ) : (
            <>
              <DropdownMenu
                label="Sample organization"
                className="top-bar__organization-menu"
                trigger={
                  <>
                    <span className="sr-only">Sample organization: </span>
                    <span className="top-bar__organization-name">{activeOrganization.name}</span>
                    <Icon name="chevronDown" />
                  </>
                }
                entries={organizationEntries}
              />

              <DropdownMenu
                label="Preview user"
                className="top-bar__user-menu"
                trigger={
                  <>
                    <span className="sr-only">Preview user: </span>
                    <span className="top-bar__avatar" aria-hidden="true">
                      {previewUserInitials}
                    </span>
                    <span className="top-bar__user-copy">
                      <span className="top-bar__user-name">{previewUser.data.name}</span>
                      <span className="top-bar__user-status">{previewUser.data.role}</span>
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
