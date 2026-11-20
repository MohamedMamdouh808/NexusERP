/**
 * The profile screen.
 *
 * The identity shown is the real signed-in user, read from the session store
 * (which is the service's own answer to /auth/me): email, roles, organization
 * and the module context. No password material and no other user's data exists
 * on this screen (FR-026). The appearance card is the personal-preference
 * surface: theme, density and language stay in this browser and never reach the
 * server.
 *
 * Improvements over the original: a two-column layout, an initials avatar,
 * organization context (currency, terms, modules), a must-change-password
 * banner, an inline change-password form with sign-out, a "system" theme and a
 * density toggle, a recent-activity card, a default-landing-page preference and
 * a keyboard-shortcut reference.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import {
  Button,
  Card,
  Input,
} from '../../components/ui';
import { roleLabel } from '../../components/shell/role-label';
import { isAppLanguage, setAppLanguage, type AppLanguage } from '../../i18n';
import { useAppearance } from '../../lib/use-appearance';
import { useSession, signOut } from '../../services/auth-session';
import { changePassword } from '../../services/auth-client';
import { listAuditEntries } from '../../services/audit-client';
import { ACTIVITY_LABELS } from '../../features/overview/activity-labels';
import { useQuery } from '@tanstack/react-query';

const LANDING_KEY = 'nexuserp_landing_page';

function initials(email: string, name?: string | null): string {
  const source = (name ?? email).trim();
  if (source === '') return '?';
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const appearance = useAppearance();

  const signedIn = session.status === 'signed-in';
  const user = signedIn ? session.user : null;
  const membership = signedIn ? session.membership : null;
  const organization = signedIn ? session.organization : null;

  const language: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : 'en';

  // --- Change password form state ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordPending, setPasswordPending] = useState(false);

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword.length < 12) {
      setPasswordError(t('auth.register.passwordMinLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile.security.passwordMismatch'));
      return;
    }
    setPasswordPending(true);
    const result = await changePassword(currentPassword, newPassword);
    setPasswordPending(false);
    if (result.ok) {
      setPasswordSuccess(t('profile.security.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordError(result.failure.message);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  // --- Default landing page preference ---
  const [landingPage, setLandingPage] = useState<string>(() => {
    try {
      return localStorage.getItem(LANDING_KEY) ?? '/';
    } catch {
      return '/';
    }
  });
  function chooseLanding(value: string) {
    setLandingPage(value);
    try {
      localStorage.setItem(LANDING_KEY, value);
    } catch {
      /* ignore */
    }
  }

  // --- Recent activity ---
  const recentActivity = useQuery({
    queryKey: ['profile', 'recent-activity', signedIn ? session.user.id : null],
    queryFn: async () => {
      if (!signedIn) return null;
      const result = await listAuditEntries({ userId: session.user.id, page: 1, pageSize: 5 });
      return result.ok ? result.data : null;
    },
    enabled: signedIn,
  });

  const themeOptions = [
    { id: 'theme-light', label: t('profile.appearance.light.label'), detail: t('profile.appearance.light.detail'), selected: appearance.preference === 'light', onSelect: () => appearance.theme('light') },
    { id: 'theme-dark', label: t('profile.appearance.dark.label'), detail: t('profile.appearance.dark.detail'), selected: appearance.preference === 'dark', onSelect: () => appearance.theme('dark') },
    { id: 'theme-system', label: t('profile.appearance.system.label'), detail: t('profile.appearance.system.detail'), selected: appearance.preference === 'system', onSelect: () => appearance.theme('system') },
  ];

  const densityOptions = [
    { id: 'density-comfortable', label: t('profile.appearance.comfortable.label'), detail: t('profile.appearance.comfortable.detail'), selected: appearance.density === 'comfortable', onSelect: () => appearance.compact('comfortable') },
    { id: 'density-compact', label: t('profile.appearance.compact.label'), detail: t('profile.appearance.compact.detail'), selected: appearance.density === 'compact', onSelect: () => appearance.compact('compact') },
  ];

  const languageOptions = [
    { id: 'language-en', label: 'English', detail: t('profile.appearance.english.detail'), selected: language === 'en', onSelect: () => void setAppLanguage('en') },
    { id: 'language-ar', label: 'العربية', detail: t('profile.appearance.arabic.detail'), selected: language === 'ar', onSelect: () => void setAppLanguage('ar') },
  ];

  const shortcuts = [
    { keys: 'Ctrl + K', action: t('profile.shortcuts.commandPalette') },
    { keys: 'g then o', action: t('profile.shortcuts.overview') },
    { keys: 'g then s', action: t('profile.shortcuts.sales') },
    { keys: 'g then i', action: t('profile.shortcuts.inventory') },
    { keys: 'g then p', action: t('profile.shortcuts.products') },
    { keys: 'g then c', action: t('profile.shortcuts.contacts') },
    { keys: 'g then r', action: t('profile.shortcuts.reports') },
    { keys: 'g then v', action: t('profile.shortcuts.invoicing') },
    { keys: 'g then u', action: t('profile.shortcuts.users') },
  ];

  return (
    <section className="profile-page">
      <PageHeader title={t('profile.header.title')} description={t('profile.header.description')} />
      <div className="profile-page__grid">
        <div className="profile-page__column">
          {signedIn && user !== null && (
            <Card title={t('profile.account.title')}>
              <div className="profile-avatar" aria-hidden="true">
                {initials(user.email, membership?.name)}
              </div>
              <dl className="profile-details">
                <dt>{t('profile.account.email')}</dt>
                <dd>{user.email}</dd>
                <dt>{t('profile.account.role')}</dt>
                <dd>{roleLabel(membership?.roles ?? [])}</dd>
                {membership?.name && (
                  <>
                    <dt>{t('profile.account.displayName')}</dt>
                    <dd>{membership.name}</dd>
                  </>
                )}
                <dt>{t('profile.account.organization')}</dt>
                <dd>{organization?.name ?? '—'}</dd>
                {organization && (
                  <>
                    <dt>{t('profile.account.currency')}</dt>
                    <dd>{organization.currencyCode}</dd>
                    <dt>{t('profile.account.paymentTerms')}</dt>
                    <dd>{organization.defaultPaymentTermsDays} {t('profile.account.days')}</dd>
                    <dt>{t('profile.account.modules')}</dt>
                    <dd>{organization.enabledModules.length} {t('profile.account.enabled')}</dd>
                  </>
                )}
              </dl>
              {user.mustChangePassword && (
                <p className="form-error" role="alert">{t('profile.account.mustChangePassword')}</p>
              )}
              <p className="form-help-text">{t('profile.account.serverEnforces')}</p>
            </Card>
          )}
          <Card title={t('profile.security.title')} description={t('profile.security.description')}>
            <form onSubmit={handleChangePassword} noValidate>
              <div className="settings-fields">
                <Input
                  id="current-password"
                  label={t('profile.security.currentPassword')}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                <Input
                  id="new-password"
                  label={t('profile.security.newPassword')}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <Input
                  id="confirm-password"
                  label={t('profile.security.confirmPassword')}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
              {passwordSuccess && <p className="form-help-text" role="status">{passwordSuccess}</p>}
              <div className="settings-actions">
                <Button type="submit" variant="primary" loading={passwordPending}>
                  {t('profile.security.changePassword')}
                </Button>
                <Button variant="secondary" onClick={() => void handleSignOut()}>
                  {t('profile.security.signOut')}
                </Button>
              </div>
            </form>
          </Card>
          <Card title={t('profile.activity.title')} description={t('profile.activity.description')}>
            {recentActivity.isPending ? (
              <p>{t('profile.activity.loading')}</p>
            ) : (recentActivity.data?.entries.length ?? 0) === 0 ? (
              <p className="form-help-text">{t('profile.activity.empty')}</p>
            ) : (
              <ul className="profile-activity">
                {recentActivity.data?.entries.map((entry) => {
                  const label = ACTIVITY_LABELS[entry.action] ? t(ACTIVITY_LABELS[entry.action]) : entry.action;
                  return (
                    <li key={entry.id} className="profile-activity__item">
                      <span className="profile-activity__time">{new Date(entry.createdAt).toLocaleString()}</span>
                      <span className="profile-activity__action">{label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <div className="profile-page__column">
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
              <div className="profile-appearance__group" role="group" aria-label={t('profile.appearance.densityAria')}>
                <fieldset className="profile-appearance__options">
                  <legend>{t('profile.appearance.densityLegend')}</legend>
                  {densityOptions.map((option) => (
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
          <Card title={t('profile.preferences.title')} description={t('profile.preferences.description')}>
            <label className="settings-fields" htmlFor="landing-page">
              <span>{t('profile.preferences.landingPage')}</span>
              <select
                id="landing-page"
                value={landingPage}
                onChange={(event) => chooseLanding(event.target.value)}
              >
                <option value="/">{t('profile.preferences.overview')}</option>
                <option value="/invoicing">{t('profile.preferences.invoicing')}</option>
                <option value="/sales">{t('profile.preferences.sales')}</option>
                <option value="/purchasing">{t('profile.preferences.purchasing')}</option>
                <option value="/inventory">{t('profile.preferences.inventory')}</option>
                <option value="/reports">{t('profile.preferences.reports')}</option>
              </select>
            </label>
          </Card>
          <Card title={t('profile.shortcuts.title')} description={t('profile.shortcuts.description')}>
            <dl className="profile-details">
              {shortcuts.map((shortcut) => (
                <div key={shortcut.keys}>
                  <dt><kbd>{shortcut.keys}</kbd></dt>
                  <dd>{shortcut.action}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </section>
  );
}
