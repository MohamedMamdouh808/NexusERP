/**
 * The forced password change (FR-006, FR-007, FR-028).
 *
 * An account created by an administrator signs in with the temporary password
 * the administrator gave them, and the service then refuses EVERY other
 * capability until they choose a password of their own. The interface has to
 * offer that change, or a legitimate user is signed in and locked out with no
 * way forward.
 *
 * The screen is deliberately a full-page auth screen rather than a card inside
 * the shell: while the flag is set, the shell's own pages cannot answer, so
 * showing them would be showing the user a broken application.
 *
 * The rules are the service's own (`backend/.../change-password.dto.ts`):
 * at least 12 characters, with an uppercase letter, a lowercase letter and a
 * digit, and different from the current password.
 */

import { useTranslation } from 'react-i18next';

import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Input } from '../../components/ui';
import type { ApiFailure } from '../../lib/api-client';
import { changeOwnPassword } from '../../services/auth-session';

interface FormState {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmPassword: string;
}

interface FormErrors {
  readonly currentPassword?: string;
  readonly newPassword?: string;
  readonly confirmPassword?: string;
}

function validate(form: FormState, t: (key: string) => string): FormErrors {
  const errors: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};
  if (form.currentPassword.length === 0) {
    errors.currentPassword = t('auth.changePassword.currentRequired');
  }
  if (form.newPassword.length < 12) {
    errors.newPassword = t('auth.changePassword.newMinLength');
  } else if (!/[A-Z]/.test(form.newPassword)) {
    errors.newPassword = t('auth.changePassword.newUpper');
  } else if (!/[a-z]/.test(form.newPassword)) {
    errors.newPassword = t('auth.changePassword.newLower');
  } else if (!/[0-9]/.test(form.newPassword)) {
    errors.newPassword = t('auth.changePassword.newDigit');
  } else if (form.newPassword === form.currentPassword) {
    errors.newPassword = t('auth.changePassword.newMustDiffer');
  }
  if (form.confirmPassword.length === 0) {
    errors.confirmPassword = t('auth.changePassword.confirmRequired');
  } else if (form.confirmPassword !== form.newPassword) {
    errors.confirmPassword = t('auth.changePassword.confirmMismatch');
  }
  return errors;
}

export function ChangePasswordScreen({ email }: { readonly email: string }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  function change(patch: Partial<FormState>) {
    setForm((previous) => ({ ...previous, ...patch }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validate(form, t);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setPending(true);
    setFailure(null);
    const outcome = await changeOwnPassword(form.currentPassword, form.newPassword);
    setPending(false);
    if (!outcome.ok) {
      // The service names the field that failed (INVALID_CURRENT_PASSWORD, the
      // policy, the rate limit). Its message is shown as it is - this screen is
      // about the caller's own password, so there is nothing to hide.
      setFailure(outcome.failure);
    }
    // On success the store re-probes and the flag is gone, so the shell renders.
  }

  return (
    <div className="auth-screen">
      <div className="auth-screen__inner">
        <div className="card auth-screen__card">
          <h1 className="auth-screen__title">{t('auth.changePassword.title')}</h1>
          <p className="auth-screen__lede">
            {t('auth.changePassword.lede')}
            {signedInAs(email)}
          </p>
          <form onSubmit={onSubmit} noValidate={true}>
            <div className="auth-screen__fields">
              <Input
                id="change-current-password"
                label={t('auth.changePassword.temporaryPassword')}
                type="password"
                autoComplete="current-password"
                required={true}
                value={form.currentPassword}
                error={errors.currentPassword}
                onChange={(event) => change({ currentPassword: event.target.value })}
              />
              <Input
                id="change-new-password"
                label={t('auth.changePassword.newPassword')}
                type="password"
                autoComplete="new-password"
                required={true}
                value={form.newPassword}
                error={errors.newPassword}
                onChange={(event) => change({ newPassword: event.target.value })}
              />
              <Input
                id="change-confirm-password"
                label={t('auth.changePassword.confirmPassword')}
                type="password"
                autoComplete="new-password"
                required={true}
                value={form.confirmPassword}
                error={errors.confirmPassword}
                onChange={(event) => change({ confirmPassword: event.target.value })}
              />
            </div>
            {failure !== null && (
              <div className="auth-screen__error" role="alert" aria-live="assertive">
                <p>{failure.message}</p>
                <p className="auth-screen__error-request-id">
                  {t('ui.errorState.referenceLabel')}
                  <code>{failure.requestId}</code> · HTTP {failure.status}
                </p>
              </div>
            )}
            <div className="auth-screen__actions">
              <Button variant="primary" type="submit" loading={pending} disabled={pending}>
                {pending ? t('auth.changePassword.submitPending') : t('auth.changePassword.submit')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Names the account only when the service told us which one it is. */
function signedInAs(email: string): string {
  return email.length > 0 ? ` (${email}).` : '.';
}
