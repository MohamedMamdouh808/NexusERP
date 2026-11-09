/**
 * The profile screen.
 *
 * The identity shown is the real signed-in user, read from the session store
 * (which is the service's own answer to /auth/me): email and role. No password
 * material and no other user's data exists on this screen (FR-026). The
 * appearance card below it is the one local preference surface: theme and
 * layout direction stay in this browser and are never sent to the service.
 */

import { PageHeader } from '../../components/shell/page-header';
import { Card } from '../../components/ui';
import { roleLabel } from '../../components/shell/role-label';
import { useAppearance } from '../../lib/use-appearance';
import { useSession } from '../../services/auth-session';

interface AppearanceOption {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

/** The theme rows: Light and Dark, the two themes the design system ships. */
function themeOptions(onPick: (theme: 'light' | 'dark') => void, preference: string, resolved: 'light' | 'dark'): AppearanceOption[] {
  const effective = preference === 'light' || preference === 'dark' ? preference : resolved;
  return [
    { id: 'theme-light', label: 'Light', detail: 'White surfaces with the indigo signal', selected: effective === 'light', onSelect: () => onPick('light') },
    { id: 'theme-dark', label: 'Dark', detail: 'Nexus Slate on a deep canvas', selected: effective === 'dark', onSelect: () => onPick('dark') },
  ];
}

/** The direction rows: English reads left to right, Arabic right to left. */
function directionOptions(onPick: (direction: 'ltr' | 'rtl') => void, direction: 'ltr' | 'rtl'): AppearanceOption[] {
  return [
    { id: 'direction-ltr', label: 'English', detail: 'Layout runs from left to right', selected: direction === 'ltr', onSelect: () => onPick('ltr') },
    { id: 'direction-rtl', label: 'العربية', detail: 'Layout runs from right to left', selected: direction === 'rtl', onSelect: () => onPick('rtl') },
  ];
}

export function ProfilePage() {
  const session = useSession();
  const appearance = useAppearance();
  const pickTheme = (theme: 'light' | 'dark') => appearance.theme(theme);
  const pickDirection = (direction: 'ltr' | 'rtl') => appearance.switchDirection(direction);

  return (
    <section className="profile-page">
      <PageHeader title="Profile" description="The account you are signed in with, and this browser's appearance." />
      {session.status === 'signed-in' && (
        <Card title="Your account">
          <dl className="profile-details">
            <dt>Email</dt>
            <dd>{session.user.email}</dd>
            <dt>Role</dt>
            <dd>{roleLabel(session.membership.roleKey)}</dd>
            <dt>Organization</dt>
            <dd>{session.organization.name}</dd>
          </dl>
          <p className="form-help-text">Access to application data is enforced by the server, scoped to this organization.</p>
        </Card>
      )}
      <Card title="Appearance" description="Theme and layout direction for this browser; stored locally and never sent to the server.">
        <div className="profile-appearance">
          <div className="profile-appearance__group" role="group" aria-label="Theme">
            <fieldset className="profile-appearance__options">
              <legend>Theme</legend>
              {themeOptions(pickTheme, appearance.preference, appearance.resolved).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={option.selected ? 'profile-appearance__option profile-appearance__option--selected' : 'profile-appearance__option'}
                  aria-pressed={option.selected}
                  onClick={option.onSelect}
                >
                  <span className="profile-appearance__option-label">{option.label}</span>
                  <span className="profile-appearance__option-detail">{option.detail}</span>
                </button>
              ))}
            </fieldset>
          </div>
          <div className="profile-appearance__group" role="group" aria-label="Layout direction">
            <fieldset className="profile-appearance__options">
              <legend>Language &amp; direction</legend>
              {directionOptions(pickDirection, appearance.direction).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={option.selected ? 'profile-appearance__option profile-appearance__option--selected' : 'profile-appearance__option'}
                  aria-pressed={option.selected}
                  onClick={option.onSelect}
                >
                  <span className="profile-appearance__option-label">{option.label}</span>
                  <span className="profile-appearance__option-detail">{option.detail}</span>
                </button>
              ))}
            </fieldset>
          </div>
        </div>
        <p className="form-help-text">Light and dark are the two themes; English lays the interface out left to right, Arabic mirrors it right to left.</p>
      </Card>
    </section>
  );
}
