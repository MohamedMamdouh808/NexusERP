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

function validate(form: FormState): FormErrors {
  const errors: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};
  if (form.currentPassword.length === 0) {
    errors.currentPassword = 'Current password is required.';
  }
  if (form.newPassword.length < 12) {
    errors.newPassword = 'New password must be at least 12 characters long.';
  } else if (!/[A-Z]/.test(form.newPassword)) {
    errors.newPassword = 'New password must contain at least one uppercase letter.';
  } else if (!/[a-z]/.test(form.newPassword)) {
    errors.newPassword = 'New password must contain at least one lowercase letter.';
  } else if (!/[0-9]/.test(form.newPassword)) {
    errors.newPassword = 'New password must contain at least one digit.';
  } else if (form.newPassword === form.currentPassword) {
    errors.newPassword = 'New password must differ from the current password.';
  }
  if (form.confirmPassword.length === 0) {
    errors.confirmPassword = 'Confirm the new password.';
  } else if (form.confirmPassword !== form.newPassword) {
    errors.confirmPassword = 'The two passwords do not match.';
  }
  return errors;
}

export function ChangePasswordScreen({ email }: { readonly email: string }) {
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
    const validation = validate(form);
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
          <h1 className="auth-screen__title">Choose your password</h1>
          <p className="auth-screen__lede">
            This account was created for you with a temporary password. Choose your own before you
            continue{signedInAs(email)}
          </p>
          <form onSubmit={onSubmit} noValidate={true}>
            <div className="auth-screen__fields">
              <Input
                id="change-current-password"
                label="Temporary password"
                type="password"
                autoComplete="current-password"
                required={true}
                value={form.currentPassword}
                error={errors.currentPassword}
                onChange={(event) => change({ currentPassword: event.target.value })}
              />
              <Input
                id="change-new-password"
                label="New password"
                type="password"
                autoComplete="new-password"
                required={true}
                value={form.newPassword}
                error={errors.newPassword}
                onChange={(event) => change({ newPassword: event.target.value })}
              />
              <Input
                id="change-confirm-password"
                label="Confirm new password"
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
                  Reference ID: <code>{failure.requestId}</code>
                </p>
              </div>
            )}
            <div className="auth-screen__actions">
              <Button variant="primary" type="submit" loading={pending} disabled={pending}>
                {pending ? 'Saving…' : 'Save password'}
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
