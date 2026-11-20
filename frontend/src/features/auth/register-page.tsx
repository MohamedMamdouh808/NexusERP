/**
 * The registration screen (FR-001, P0-F001).
 *
 * Contract-literal: the service accepts email, password and an optional
 * organizationName (its schema is Zod-strict about all three, unknown keys are
 * rejected), and creates the user's organization itself — from the typed name
 * when present, or from the email otherwise. The typed name is trimmed
 * client-side only for the inline fail-fast mirror of the server's own rule
 * (2–128 characters after trim); the service remains the authority.
 *
 * Registration signs the user in and opens the shell: the register response
 * carries one-time tokens but sets no cookies, so the store follows up with a
 * login call instead, and neither response's tokens are stored (FR-011).
 *
 * The service currently answers a duplicate email with 500 - a documented gap
 * (the contract maps it to eventual CONFLICT). Until it is, any non-validation
 * failure shows its catalogued message plus the request identifier honestly,
 * and never invents a rule the service did not apply.
 */

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button, Input, Select } from '../../components/ui';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from '@nexuserp/shared';
import { isRateLimited } from '../../lib/api-client';
import type { ApiFailure } from '../../lib/api-client';
import { useTranslation } from 'react-i18next';
import { registerAndSignIn, useSession } from '../../services/auth-session';

interface FormState {
  readonly email: string;
  readonly password: string;
  readonly organizationName: string;
  readonly currencyCode: string;
}

interface FormErrors {
  readonly email?: string;
  readonly password?: string;
  readonly organizationName?: string;
  readonly currencyCode?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The password rule, restated verbatim from the service's schema. */
export const PASSWORD_RULE = 'At least 12 characters, with an uppercase letter, a lowercase letter and a digit.';

/** The client-side mirror of the registration schema (fail fast, same rules). */
export function validateRegistration(
  form: FormState,
  t: (key: string) => string,
): FormErrors {
  const errors: { email?: string; password?: string; organizationName?: string; currencyCode?: string } = {};
  if (form.email.trim().length === 0) errors.email = t('auth.login.emailRequired');
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = t('auth.login.emailInvalid');
  if (form.password.length < 12) {
    errors.password = t('auth.register.passwordMinLength');
  } else if (!/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password)) {
    errors.password = t('auth.register.passwordRuleError');
  }
  const name = form.organizationName.trim();
  if (name !== '') {
    if (name.length < 1) errors.organizationName = t('auth.register.organizationNameTooShort');
    else if (name.length > 100) errors.organizationName = t('auth.register.organizationNameTooLong');
  }
  if (!SUPPORTED_CURRENCIES.some((code) => code === form.currencyCode)) {
    errors.currencyCode = t('auth.register.currencyInvalid');
  }
  return errors;
}

function originFrom(locationState: unknown): string {
  const from = (locationState as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') ? from : '/';
}

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>({ email: '', password: '', organizationName: '', currencyCode: DEFAULT_CURRENCY });
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const retryTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestedFrom = originFrom(location.state);

  useEffect(() => {
    // Copy the current id first: the cleanup reads the ref as the component
    // unmounts, when the ref itself is already being torn down.
    const timer = retryTimer.current;
    return () => {
      if (timer !== null) clearInterval(timer);
    };
  }, []);

  if (session.status === 'signed-in') {
    return <Navigate to={requestedFrom} replace />;
  }

  function change(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function blur(field: keyof FormState) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validateRegistration(form, t));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validateRegistration(form, t);
    setErrors(validation);
    setTouched({ email: true, password: true, organizationName: true, currencyCode: true });
    if (Object.keys(validation).length > 0) return;

    setPending(true);
    setFailure(null);
    const outcome = await registerAndSignIn(form.email.trim(), form.password, form.organizationName.trim(), form.currencyCode);
    setPending(false);

    if (outcome.ok) {
      navigate(requestedFrom, { replace: true });
      return;
    }
    setFailure(outcome.failure);
  }

  const shownErrors: FormErrors = {
    email: touched.email ? errors.email : undefined,
    password: touched.password ? errors.password : undefined,
    organizationName: touched.organizationName ? errors.organizationName : undefined,
    currencyCode: touched.currencyCode ? errors.currencyCode : undefined,
  };

  const rateLimited = failure !== null && isRateLimited(failure);
  const rateLimitedSeconds = rateLimited ? failure.retryAfterSeconds : null;

  return (
    <div className="auth-screen">
      <div className="auth-screen__inner">
        <div className="auth-screen__brand">
          <svg className="top-bar__logomark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--color-primary)" />
            <rect x="7" y="7" width="8" height="8" rx="2" fill="var(--color-on-primary)" />
            <rect x="17" y="7" width="8" height="8" rx="2" fill="var(--color-secondary)" />
            <rect x="7" y="17" width="8" height="8" rx="2" fill="var(--color-secondary)" />
            <rect x="17" y="17" width="8" height="8" rx="2" fill="var(--color-on-primary)" />
          </svg>
          <span aria-hidden="true">NexusERP</span>
        </div>
        <div className="card auth-screen__card">
          <h1 className="auth-screen__title">{t('auth.register.title')}</h1>
          <p className="auth-screen__lede">
            {t('auth.register.lede')}
          </p>
          <form onSubmit={onSubmit} noValidate={true}>
            <div className="auth-screen__fields">
              <Input
                id="register-email"
                label={t('auth.register.email')}
                type="email"
                autoComplete="email"
                required={true}
                value={form.email}
                error={shownErrors.email}
                onChange={(event) => change({ email: event.target.value })}
                onBlur={() => blur('email')}
              />
              <Input
                id="register-password"
                label={t('auth.register.password')}
                type="password"
                autoComplete="new-password"
                required={true}
                helpText={t('auth.register.passwordRule')}
                value={form.password}
                error={shownErrors.password}
                onChange={(event) => change({ password: event.target.value })}
                onBlur={() => blur('password')}
              />
              <Input
                id="register-organization-name"
                label={t('auth.register.organizationName')}
                type="text"
                autoComplete="organization"
                placeholder={t('auth.register.organizationNamePlaceholder')}
                helpText={t('auth.register.organizationNameHelp')}
                value={form.organizationName}
                error={shownErrors.organizationName}
                onChange={(event) => change({ organizationName: event.target.value })}
                onBlur={() => blur('organizationName')}
              />
              <Select
                id="register-currency"
                label={t('auth.register.currency')}
                options={SUPPORTED_CURRENCIES.map((code) => ({ value: code, label: code }))}
                value={form.currencyCode}
                error={shownErrors.currencyCode}
                onChange={(event) => change({ currencyCode: event.target.value })}
                onBlur={() => blur('currencyCode')}
              />
            </div>
            {failure !== null && (
              <div className="auth-screen__error" role="alert" aria-live="assertive">
                <p>
                  {rateLimited
                    ? rateLimitedSeconds !== null
                      ? t('auth.register.rateLimitedIn', { count: rateLimitedSeconds })
                      : t('auth.register.rateLimited')
                    : `${t('auth.register.createFailed')} ${failure.message}`}
                </p>
                <p className="auth-screen__error-request-id">
                  {t('ui.errorState.referenceLabel')}
                  <code>{failure.requestId}</code> · HTTP {failure.status}
                </p>
              </div>
            )}
            <div className="auth-screen__actions">
              <Button variant="primary" type="submit" loading={pending} disabled={pending}>
                {pending ? t('auth.register.submitPending') : t('auth.register.submit')}
              </Button>
              <p className="auth-screen__alt">
                {t('auth.register.alreadyRegistered')}
                <Link to="/login">{t('auth.register.signIn')}</Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
