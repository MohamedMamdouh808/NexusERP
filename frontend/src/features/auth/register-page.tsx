/**
 * The registration screen (FR-001, P0-F001).
 *
 * Contract-literal: the service accepts EXACTLY email + password (its schema
 * is Zod-strict, unknown keys are rejected), and it creates the user's first
 * organization itself - named from the email - so the form asks no more than
 * the contract does. The fields mirror the service's own rules: a valid email,
 * a password at least 12 characters long with at least one uppercase letter,
 * one lowercase letter and one digit; the rule text sits under the field so
 * the requirement is visible before the first mistake, not after (FR-015).
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

import { Button, Input } from '../../components/ui';
import { isRateLimited } from '../../lib/api-client';
import type { ApiFailure } from '../../lib/api-client';
import { registerAndSignIn, useSession } from '../../services/auth-session';

interface FormState {
  readonly email: string;
  readonly password: string;
}

interface FormErrors {
  readonly email?: string;
  readonly password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The password rule, restated verbatim from the service's schema. */
export const PASSWORD_RULE = 'At least 12 characters, with an uppercase letter, a lowercase letter and a digit.';

/** The client-side mirror of the registration schema (fail fast, same rules). */
export function validateRegistration(form: FormState): FormErrors {
  const errors: { email?: string; password?: string } = {};
  if (form.email.trim().length === 0) errors.email = 'Email is required.';
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (form.password.length < 12) {
    errors.password = 'Password must be at least 12 characters.';
  } else if (!/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password)) {
    errors.password =
      'Password must include an uppercase letter, a lowercase letter and a digit.';
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
  const [form, setForm] = useState<FormState>({ email: '', password: '' });
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
    setErrors(validateRegistration(form));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validateRegistration(form);
    setErrors(validation);
    setTouched({ email: true, password: true });
    if (Object.keys(validation).length > 0) return;

    setPending(true);
    setFailure(null);
    const outcome = await registerAndSignIn(form.email.trim(), form.password);
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
          <h1 className="auth-screen__title">Create your account</h1>
          <p className="auth-screen__lede">
            Your organization is set up with the account: roles, permissions, a warehouse and
            document numbering.
          </p>
          <form onSubmit={onSubmit} noValidate={true}>
            <div className="auth-screen__fields">
              <Input
                id="register-email"
                label="Email"
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
                label="Password"
                type="password"
                autoComplete="new-password"
                required={true}
                helpText={PASSWORD_RULE}
                value={form.password}
                error={shownErrors.password}
                onChange={(event) => change({ password: event.target.value })}
                onBlur={() => blur('password')}
              />
            </div>
            {failure !== null && (
              <div className="auth-screen__error" role="alert" aria-live="assertive">
                <p>
                  {rateLimited
                    ? rateLimitedSeconds !== null
                      ? `Too many attempts. Try again in ${rateLimitedSeconds} second${rateLimitedSeconds === 1 ? '' : 's'}.`
                      : 'Too many attempts. Try again later.'
                    : `The account could not be created. ${failure.message}`}
                </p>
                <p className="auth-screen__error-request-id">
                  Reference ID: <code>{failure.requestId}</code>
                </p>
              </div>
            )}
            <div className="auth-screen__actions">
              <Button variant="primary" type="submit" loading={pending} disabled={pending}>
                {pending ? 'Creating account…' : 'Create account'}
              </Button>
              <p className="auth-screen__alt">
                Already registered? <Link to="/login">Sign in</Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
