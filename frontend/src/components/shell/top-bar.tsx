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
 *    "Preview user:" are the labels FR-013 names, and the top bar also carries
 *    the visible "Sample data" marker the whole surface falls under (FR-040).
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

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { sampleShellService } from '../../services/sample-shell-service';
import { DropdownMenu } from '../ui/dropdown-menu';
import type { DropdownMenuEntry } from '../ui/dropdown-menu';
import { Icon } from '../ui/icon';

/** The one explanation an authenticated-only entry carries (FR-015). */
const AUTHENTICATION_NOT_IN_FEATURE = 'Authentication is not part of this feature.';

export function TopBar() {
  const organizations = useQuery({
    queryKey: ['shell', 'organizations'],
    queryFn: () => sampleShellService.listOrganizations(),
  });
  const previewUser = useQuery({
    queryKey: ['shell', 'preview-user'],
    queryFn: () => sampleShellService.getPreviewUser(),
  });

  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);

  // The shell starts on the first organization the service returns; a selection
  // replaces it. Nothing is written down, so a reload starts here again.
  const activeOrganization =
    organizations.data?.find((organization) => organization.id === selectedOrganizationId) ??
    organizations.data?.[0];

  const organizationEntries: readonly DropdownMenuEntry[] = (organizations.data ?? []).map(
    (organization) => ({
      kind: 'item',
      id: organization.id,
      label: organization.name,
      selected: organization.id === activeOrganization?.id,
      onSelect: () => setSelectedOrganizationId(organization.id),
    }),
  );

  const userEntries: readonly DropdownMenuEntry[] = [
    {
      kind: 'unavailable',
      id: 'account-settings',
      label: 'Account settings',
      reason: AUTHENTICATION_NOT_IN_FEATURE,
    },
  ];

  return (
    <header className="app-shell__topbar">
      <span className="top-bar__brand">NexusERP</span>

      <div className="top-bar__account">
        <span className="sample-marker">Sample data</span>

        {activeOrganization === undefined || previewUser.data === undefined ? (
          <span className="top-bar__pending" role="status">
            Loading the sample organization and preview user
          </span>
        ) : (
          <>
            <DropdownMenu
              label="Sample organization"
              className="top-bar__menu"
              trigger={
                <>
                  <span className="top-bar__trigger-label">Sample organization:</span>
                  <span>{activeOrganization.name}</span>
                  <Icon name="chevronDown" />
                </>
              }
              entries={organizationEntries}
            />

            <DropdownMenu
              label="Preview user"
              className="top-bar__menu"
              trigger={
                <>
                  <span className="top-bar__trigger-label">Preview user:</span>
                  <span>{previewUser.data.role}</span>
                  <Icon name="chevronDown" />
                </>
              }
              entries={userEntries}
            />
          </>
        )}
      </div>
    </header>
  );
}
