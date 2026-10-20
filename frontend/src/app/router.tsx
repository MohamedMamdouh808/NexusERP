import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';

import { AppShell } from '../components/shell/app-shell';
import { Breadcrumb } from '../components/shell/breadcrumb';
import { PageHeader } from '../components/shell/page-header';
import { HealthPanel } from '../features/health/health-panel';
import { OverviewPage } from '../features/overview/overview-page';

const DevGallery = import.meta.env.DEV
  ? lazy(() => import('../dev/gallery/gallery-route').then((m) => ({ default: m.GalleryRoute })))
  : null;

/**
 * The route table, exported so a test can assert that every navigation
 * destination actually resolves rather than merely existing in a list (T078).
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <AppShell>
        <Breadcrumb />
        <OverviewPage />
      </AppShell>
    ),
  },
  {
    path: '/health',
    element: (
      <AppShell>
        <Breadcrumb />
        <PageHeader title="System health" />
        <HealthPanel />
      </AppShell>
    ),
  },
  ...(DevGallery
    ? [
        {
          path: '/dev/gallery',
          element: (
            <Suspense fallback={<div>Loading gallery...</div>}>
              <DevGallery />
            </Suspense>
          ),
        },
      ]
    : []),
  { path: '*', element: <Navigate to="/" replace /> },
];

/**
 * Routes (T088). Two destinations, both of which exist: an overview and the live
 * health panel. There is no sign-in route, because this feature has no
 * authentication and a stub sign-in screen would imply one (research.md R-015).
 */
export const router = createBrowserRouter(routes);
