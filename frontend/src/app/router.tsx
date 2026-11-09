import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import type { ReactNode } from 'react';

import { AppShell } from '../components/shell/app-shell';
import { Breadcrumb } from '../components/shell/breadcrumb';
import { PageHeader } from '../components/shell/page-header';
import { SessionGate } from '../features/auth/session-gate';
import { LoginPage } from '../features/auth/login-page';
import { RegisterPage } from '../features/auth/register-page';
import { ProfilePage } from '../features/profile/profile-page';
import { HealthPanel } from '../features/health/health-panel';
import { OverviewPage } from '../features/overview/overview-page';
import { ProductsPage } from '../features/products/products-page';
import { ProductNewPage } from '../features/products/product-new-page';
import { ProductEditPage } from '../features/products/product-edit-page';
import { ProductDetailPage } from '../features/products/product-detail-page';
import { ContactsPage } from '../features/contacts/contacts-page';
import { ContactNewPage } from '../features/contacts/contact-new-page';
import { ContactEditPage } from '../features/contacts/contact-edit-page';
import { ContactDetailPage } from '../features/contacts/contact-detail-page';
import { InventoryPage } from '../features/inventory/inventory-page';
import { PurchasingPage } from '../features/purchasing/purchasing-page';
import { OrderNewPage as PurchaseOrderNewPage } from '../features/purchasing/order-new-page';
import { OrderEditPage as PurchaseOrderEditPage } from '../features/purchasing/order-edit-page';
import { OrderDetailPage as PurchaseOrderDetailPage } from '../features/purchasing/order-detail-page';
import { SalesPage } from '../features/sales/sales-page';
import { OrderNewPage as SalesOrderNewPage } from '../features/sales/order-new-page';
import { OrderEditPage as SalesOrderEditPage } from '../features/sales/order-edit-page';
import { OrderDetailPage as SalesOrderDetailPage } from '../features/sales/order-detail-page';
import { InvoicingPage } from '../features/invoicing/invoicing-page';
import { InvoiceDetailPage } from '../features/invoicing/invoice-detail-page';
import { PaymentFormPage } from '../features/invoicing/payment-form-page';
import { PaymentDetailPage } from '../features/invoicing/payment-detail-page';
import { OrganizationPage } from '../features/administration/organization-page';
import { UsersPage } from '../features/administration/users-page';
import { RoleDetailPage } from '../features/administration/role-detail-page';
import { AuditLogPage } from '../features/administration/audit-log-page';
import { ReportsPage } from '../features/reports/reports-page';

const DevGallery = import.meta.env.DEV
  ? lazy(() => import('../dev/gallery/gallery-route').then((m) => ({ default: m.GalleryRoute })))
  : null;

/**
 * A shell route: the authenticated shell behind the session gate, with the
 * breadcrumb in place. The gate lives at the ROUTER level, not inside AppShell,
 * so the shell stays a pure layout component and only reachable-when-signed-in
 * screens ever sit behind it (FR-045).
 */
function shell(children: ReactNode): ReactNode {
  return (
    <SessionGate>
      <AppShell>
        <Breadcrumb />
        {children}
      </AppShell>
    </SessionGate>
  );
}

/**
 * The route table, exported so a test can assert that every navigation
 * destination actually resolves rather than merely existing in a list (T078).
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/', element: shell(<OverviewPage />) },
  { path: '/health', element: shell(<><PageHeader title="System health" /><HealthPanel /></>) },
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
  { path: '/products', element: shell(<ProductsPage />) },
  { path: '/products/new', element: shell(<ProductNewPage />) },
  { path: '/products/:id', element: shell(<ProductDetailPage />) },
  { path: '/products/:id/edit', element: shell(<ProductEditPage />) },
  { path: '/contacts', element: shell(<ContactsPage />) },
  { path: '/contacts/new', element: shell(<ContactNewPage />) },
  { path: '/contacts/:id', element: shell(<ContactDetailPage />) },
  { path: '/contacts/:id/edit', element: shell(<ContactEditPage />) },
  { path: '/inventory', element: shell(<InventoryPage />) },
  { path: '/inventory/movements', element: shell(<InventoryPage />) },
  { path: '/inventory/warehouses', element: shell(<InventoryPage />) },
  { path: '/purchasing', element: shell(<PurchasingPage />) },
  { path: '/purchasing/receipts', element: shell(<PurchasingPage />) },
  { path: '/purchasing/new', element: shell(<PurchaseOrderNewPage />) },
  { path: '/purchasing/:id', element: shell(<PurchaseOrderDetailPage />) },
  { path: '/purchasing/:id/edit', element: shell(<PurchaseOrderEditPage />) },
  // Sales routes. The static paths are declared BEFORE the /sales/:id route,
  // so /sales/new and /sales/shipments match exactly rather than as an id.
  { path: '/sales', element: shell(<SalesPage />) },
  { path: '/sales/shipments', element: shell(<SalesPage />) },
  { path: '/sales/new', element: shell(<SalesOrderNewPage />) },
  { path: '/sales/:id', element: shell(<SalesOrderDetailPage />) },
  { path: '/sales/:id/edit', element: shell(<SalesOrderEditPage />) },
  { path: '/invoicing', element: shell(<InvoicingPage />) },
  { path: '/invoicing/payments', element: shell(<InvoicingPage />) },
  { path: '/invoicing/payments/new', element: shell(<PaymentFormPage />) },
  { path: '/invoicing/payments/:id', element: shell(<PaymentDetailPage />) },
  { path: '/invoicing/:id', element: shell(<InvoiceDetailPage />) },
  { path: '/settings/organization', element: shell(<OrganizationPage />) },
  { path: '/users', element: shell(<UsersPage />) },
  { path: '/users/roles', element: shell(<UsersPage />) },
  { path: '/users/roles/:id', element: shell(<RoleDetailPage />) },
  { path: '/audit-log', element: shell(<AuditLogPage />) },
  { path: '/reports', element: shell(<ReportsPage />) },
  { path: '/profile', element: shell(<ProfilePage />) },
  { path: '*', element: <Navigate to="/" replace /> },
];

/**
 * Routes (T088). Signed-out visitors reach only the sign-in and registration
 * screens; every other destination lives behind the SessionGate, which probes
 * /auth/me on first load and returns the visitor to the route they asked for
 * after sign-in (FR-045).
 */
export const router = createBrowserRouter(routes);
