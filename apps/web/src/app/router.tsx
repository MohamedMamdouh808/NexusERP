import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';

import { AppShell } from '../components/shell/app-shell';
import { HealthPanel } from '../features/health/health-panel';

/**
 * The route table, exported so a test can assert that every navigation
 * destination actually resolves rather than merely existing in a list (T078).
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <AppShell>
        <Overview />
      </AppShell>
    ),
  },
  {
    path: '/health',
    element: (
      <AppShell>
        <h1>System health</h1>
        <HealthPanel />
      </AppShell>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

/**
 * Routes (T088). Two destinations, both of which exist: an overview and the live
 * health panel. There is no sign-in route, because this feature has no
 * authentication and a stub sign-in screen would imply one (research.md R-015).
 */
export const router = createBrowserRouter(routes);

function Overview() {
  return (
    <>
      <h1>Overview</h1>
      <p>
        The platform foundation is running. Business modules - sales, purchasing, inventory and
        invoicing - are added by later features.
      </p>
    </>
  );
}