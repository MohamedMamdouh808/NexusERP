/**
 * The session gate (FR-045: signed-out users reach only the auth screens).
 *
 * Wraps the authenticated shell at the ROUTER level, not inside AppShell: the
 * shell stays a pure layout component that renders its children, and its own
 * tests keep passing unchanged. The gate's three states:
 *
 *  - **pending** - the /auth/me probe has not answered yet: a full-page status
 *    instead of a flash of the signed-out UI.
 *  - **signed-out** - redirect to /login, remembering where the user asked to
 *    go so the sign-in screen can send them back after they sign in.
 *  - **unreachable** - the service could not answer the probe. NOT a sign-out:
 *    an offline service must not erase a session it never rejected, so this is
 *    an honest error with a retry.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { bootstrapSession, useSession } from '../../services/auth-session';
import { ErrorState } from '../../components/ui';

export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  useEffect(() => {
    void bootstrapSession();
  }, []);

  if (session.status === 'pending') {
    return (
      <div className="auth-screen" role="status">
        <p className="auth-screen__status">Checking your session…</p>
      </div>
    );
  }

  if (session.status === 'unreachable') {
    return (
      <div className="auth-screen">
        <div className="card auth-screen__card">
          <ErrorState
            message={session.failure.message}
            requestId={session.failure.requestId}
            onRetry={() => void bootstrapSession(true)}
          />
        </div>
      </div>
    );
  }

  if (session.status === 'signed-out') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
