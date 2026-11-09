/**
 * The sign-in screen (FR-045, P0-F001).
 *
 * Plain local state with inline validation on blur and on submit - the same
 * pattern as the Products and Contacts forms, so every form behaves the same
 * way. Email and password map one-to-one onto the service's own rules
 * (`docs/api-auth-contract.md`):
 *
 *  - a valid email address and a non-empty password are the only client rules;
 *  - ANY submission failure from the service is shown as one generic message,
 *    because wrong password and unknown email are deliberately
 *    indistinguishable there (FR-010);
 *  - a rate limit shows the service's `Retry-After` as a visible countdown and
 *    the button stays disabled until it runs out (both reuse the transport's
 *    own handling: `isRateLimited` and `parseRetryAfter`);
 *  - every failure also shows the request identifier, so what the user sees
 *    can be matched against the server log (FR-031).
 *
 * A signed-in visitor who reaches /login is sent straight into the shell.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button, Input } from '../../components/ui';
import { isRateLimited } from '../../lib/api-client';
import type { ApiFailure } from '../../lib/api-client';
import { signIn, useSession } from '../../services/auth-session';

interface FormState {
  readonly email: string;
  readonly password: string;
}

interface FormErrors {
  readonly email?: string;
  readonly password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The generic wrong-credential message. Nothing the service says rewords it. */
const GENERIC_CREDENTIALS_ERROR = 'The email address or password is not correct.';

function validate(form: FormState): FormErrors {
  const errors: { email?: string; password?: string } = {};
  if (form.email.trim().length === 0) errors.email = 'Email is required.';
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (form.password.length === 0) errors.password = 'Password is required.';
  return errors;
}

function originFrom(locationState: unknown): string {
  const from = (locationState as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') ? from : '/';
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const [form, setForm] = useState<FormState>({ email: '', password: '' });
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownId = useId();

  const requestedFrom = originFrom(location.state);

  useEffect(() => {
    return () => {
      if (retryTimer.current !== null) clearInterval(retryTimer.current);
    };
  }, []);

  // Already signed in: /login is not a screen this visitor needs.
  if (session.status === 'signed-in') {
    return <Navigate to={requestedFrom} replace />;
  }

  function change(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function blur(field: keyof FormState) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validate(form));
  }

  function showRateLimit(wait: number) {
    setSecondsLeft(wait);
    if (retryTimer.current !== null) clearInterval(retryTimer.current);
    retryTimer.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null || prev <= 1) {
          if (retryTimer.current !== null) clearInterval(retryTimer.current);
          retryTimer.current = null;
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validate(form);
    setErrors(validation);
    setTouched({ email: true, password: true });
    if (Object.keys(validation).length > 0) return;

    setPending(true);
    setFailure(null);
    const outcome = await signIn(form.email.trim(), form.password);
    setPending(false);

    if (outcome.ok) {
      navigate(requestedFrom, { replace: true });
      return;
    }
    if (isRateLimited(outcome.failure)) {
      // Honour the service's own Retry-After; an absent header still reads as
      // the rate-limit failure, just without a countdown.
      if (outcome.failure.retryAfterSeconds !== null) {
        showRateLimit(outcome.failure.retryAfterSeconds);
      }
      setFailure(outcome.failure);
      return;
    }
    // Generic by design: the service refuses to distinguish wrong password
    // from unknown email, so the interface refuses to guess.
    setFailure(outcome.failure);
  }

  const shownErrors: FormErrors = {
    email: touched.email ? errors.email : undefined,
    password: touched.password ? errors.password : undefined,
  };

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
          <h1 className="auth-screen__title">Sign in</h1>
          <p className="auth-screen__lede">Use the email address and password for your account.</p>
          <form onSubmit={onSubmit} noValidate={true}>
            <div className="auth-screen__fields">
              <Input
                id="login-email"
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
                id="login-password"
                label="Password"
                type="password"
                autoComplete="current-password"
                required={true}
                value={form.password}
                error={shownErrors.password}
                onChange={(event) => change({ password: event.target.value })}
                onBlur={() => blur('password')}
              />
            </div>
            {failure !== null && (
              <div className="auth-screen__error" role="alert" aria-live="assertive">
                <p>
                  {isRateLimited(failure)
                    ? secondsLeft !== null
                      ? `Too many attempts. Try again in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}.`
                      : 'Too many attempts. Try again later.'
                    : GENERIC_CREDENTIALS_ERROR}
                </p>
                <p className="auth-screen__error-request-id">
                  Reference ID: <code>{failure.requestId}</code>
                </p>
              </div>
            )}
            {secondsLeft !== null && (
              <output aria-live="polite" className="sr-only" htmlFor={countdownId}>
                Retry in {secondsLeft} seconds
              </output>
            )}
            <div className="auth-screen__actions">
              <Button
                variant="primary"
                type="submit"
                loading={pending}
                disabled={pending || secondsLeft !== null}
              >
                {pending ? 'Signing in…' : 'Sign in'}
              </Button>
              <p className="auth-screen__alt">
                New here? <Link to="/register">Create an account</Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
