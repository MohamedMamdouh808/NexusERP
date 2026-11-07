import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/shell/page-header';
import { Card, ErrorState, Skeleton } from '../../components/ui';
import { useAppearance } from '../../lib/use-appearance';
import { sampleShellService } from '../../services/sample-shell-service';

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

export function PreviewProfilePage() {
  const user = useQuery({ queryKey: ['shell', 'preview-user'], queryFn: () => sampleShellService.getPreviewUser() });
  const appearance = useAppearance();
  const pickTheme = (theme: 'light' | 'dark') => appearance.theme(theme);
  const pickDirection = (direction: 'ltr' | 'rtl') => appearance.switchDirection(direction);

  return <section className="preview-profile-page"><PageHeader title="Preview profile" description="This is a sample preview identity, not a signed-in account."/><div className="sample-banner">Sample data</div>
    {user.isPending ? <Card title="Profile"><Skeleton label="Loading preview profile"/></Card> : user.isError || !user.data ? <ErrorState message="The preview profile could not be loaded." onRetry={() => void user.refetch()}/> : <Card title="Profile details"><dl className="profile-details"><dt>Name</dt><dd>{user.data.name}</dd><dt>Sample role</dt><dd>{user.data.role}</dd><dt>Access</dt><dd>No signed-in user or assigned permissions</dd></dl><p className="form-help-text">This profile is illustrative. Access to application data is enforced by the server.</p></Card>}
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
  </section>;
}
