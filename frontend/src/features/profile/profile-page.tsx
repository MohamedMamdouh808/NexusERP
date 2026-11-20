/**
 * The profile screen.
 *
 * The identity shown is the real signed-in user, read from the session store
 * (which is the service's own answer to /auth/me): email and role. No password
 * material and no other user's data exists on this screen (FR-026). The
 * appearance card is the one local preference surface: theme stays in this
 * browser and never reaches the server; the LANGUAGE is a local preference
 * too, stored in this browser as `nexuserp_language` and applied in place -
 * no reload, the route is preserved, and the theme is untouched.
 */

import { useTranslation } from 'react-i18next';

import { PageHeader } from '../../components/shell/page-header';
import { Card } from '../../components/ui';
import { roleLabel } from '../../components/shell/role-label';
import { isAppLanguage, setAppLanguage, type AppLanguage } from '../../i18n';
import { useAppearance } from '../../lib/use-appearance';
import { useSession } from '../../services/auth-session';

interface AppearanceOption {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const appearance = useAppearance();

  const language: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : 'en';

  const themeOptions: AppearanceOption[] = [
    {
      id: 'theme-light',
      label: t('profile.appearance.light.label'),
      detail: t('profile.appearance.light.detail'),
      selected: appearance.preference === 'light' ? true : appearance.preference === 'system' ? appearance.resolved === 'light' : false,
      onSelect: () => appearance.theme('light'),
    },
    {
      id: 'theme-dark',
      label: t('profile.appearance.dark.label'),
      detail: t('profile.appearance.dark.detail'),
      selected: appearance.preference === 'dark' ? true : appearance.preference === 'system' ? appearance.resolved === 'dark' : false,
      onSelect: () => appearance.theme('dark'),
    },
  ];

  const languageOptions: AppearanceOption[] = [
    {
      id: 'language-en',
      label: 'English',
      detail: t('profile.appearance.english.detail'),
      selected: language === 'en',
      onSelect: () => {
        void setAppLanguage('en');
      },
    },
    {
      id: 'language-ar',
      label: 'العربية',
      detail: t('profile.appearance.arabic.detail'),
      selected: language === 'ar',
      onSelect: () => {
        void setAppLanguage('ar');
      },
    },
  ];

  return (
    <section className="profile-page">
      <PageHeader title={t('profile.header.title')} description={t('profile.header.description')} />
      {session.status === 'signed-in' && (
        <Card title={t('profile.account.title')}>
          <dl className="profile-details">
            <dt>{t('profile.account.email')}</dt>
            <dd>{session.user.email}</dd>
            <dt>{t('profile.account.role')}</dt>
            <dd>{roleLabel(session.membership.roles)}</dd>
            <dt>{t('profile.account.organization')}</dt>
            <dd>{session.organization.name}</dd>
          </dl>
          <p className="form-help-text">{t('profile.account.serverEnforces')}</p>
        </Card>
      )}
      <Card title={t('profile.appearance.title')} description={t('profile.appearance.description')}>
        <div className="profile-appearance">
          <div className="profile-appearance__group" role="group" aria-label={t('profile.appearance.themeAria')}>
            <fieldset className="profile-appearance__options">
              <legend>{t('profile.appearance.themeLegend')}</legend>
              {themeOptions.map((option) => (
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
          <div className="profile-appearance__group" role="group" aria-label={t('profile.appearance.languageAria')}>
            <fieldset className="profile-appearance__options">
              <legend>{t('profile.appearance.languageLegend')}</legend>
              {languageOptions.map((option) => (
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
        <p className="form-help-text">{t('profile.appearance.helpText')}</p>
      </Card>
    </section>
  );
}
