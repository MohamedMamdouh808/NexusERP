import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';

import { AppShell } from '../components/shell/app-shell';
import { Breadcrumb } from '../components/shell/breadcrumb';
import { PageHeader } from '../components/shell/page-header';
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
import { PreviewProfilePage } from '../features/profile/preview-profile-page';

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
  {
    path: '/products',
    element: (
      <AppShell>
        <Breadcrumb />
        <ProductsPage />
      </AppShell>
    ),
  },
  {
    path: '/products/new',
    element: (
      <AppShell>
        <Breadcrumb />
        <ProductNewPage />
      </AppShell>
    ),
  },
  {
    path: '/products/:id',
    element: (
      <AppShell>
        <Breadcrumb />
        <ProductDetailPage />
      </AppShell>
    ),
  },
  {
    path: '/products/:id/edit',
    element: (
      <AppShell>
        <Breadcrumb />
        <ProductEditPage />
      </AppShell>
    ),
  },
  {
    path: '/contacts',
    element: (
      <AppShell>
        <Breadcrumb />
        <ContactsPage />
      </AppShell>
    ),
  },
  {
    path: '/contacts/new',
    element: (
      <AppShell>
        <Breadcrumb />
        <ContactNewPage />
      </AppShell>
    ),
  },
  {
    path: '/contacts/:id',
    element: (
      <AppShell>
        <Breadcrumb />
        <ContactDetailPage />
      </AppShell>
    ),
  },
  {
    path: '/contacts/:id/edit',
    element: (
      <AppShell>
        <Breadcrumb />
        <ContactEditPage />
      </AppShell>
    ),
  },
  {
    path: '/inventory',
    element: (
      <AppShell>
        <Breadcrumb />
        <InventoryPage />
      </AppShell>
    ),
  },
  {
    path: '/inventory/movements',
    element: (
      <AppShell>
        <Breadcrumb />
        <InventoryPage />
      </AppShell>
    ),
  },
  {
    path: '/inventory/warehouses',
    element: (
      <AppShell>
        <Breadcrumb />
        <InventoryPage />
      </AppShell>
    ),
  },
  {
    path: '/purchasing',
    element: (
      <AppShell>
        <Breadcrumb />
        <PurchasingPage />
      </AppShell>
    ),
  },
  {
    path: '/purchasing/receipts',
    element: (
      <AppShell>
        <Breadcrumb />
        <PurchasingPage />
      </AppShell>
    ),
  },
  {
    path: '/purchasing/new',
    element: (
      <AppShell>
        <Breadcrumb />
        <PurchaseOrderNewPage />
      </AppShell>
    ),
  },
  {
    path: '/purchasing/:id',
    element: (
      <AppShell>
        <Breadcrumb />
        <PurchaseOrderDetailPage />
      </AppShell>
    ),
  },
  {
    path: '/purchasing/:id/edit',
    element: (
      <AppShell>
        <Breadcrumb />
        <PurchaseOrderEditPage />
      </AppShell>
    ),
  },
  // Sales routes. The static paths are declared BEFORE the /sales/:id route,
  // so /sales/new and /sales/shipments match exactly rather than as an id.
  {
    path: '/sales',
    element: (
      <AppShell>
        <Breadcrumb />
        <SalesPage />
      </AppShell>
    ),
  },
  {
    path: '/sales/shipments',
    element: (
      <AppShell>
        <Breadcrumb />
        <SalesPage />
      </AppShell>
    ),
  },
  {
    path: '/sales/new',
    element: (
      <AppShell>
        <Breadcrumb />
        <SalesOrderNewPage />
      </AppShell>
    ),
  },
  {
    path: '/sales/:id',
    element: (
      <AppShell>
        <Breadcrumb />
        <SalesOrderDetailPage />
      </AppShell>
    ),
  },
  {
    path: '/sales/:id/edit',
    element: (
      <AppShell>
        <Breadcrumb />
        <SalesOrderEditPage />
      </AppShell>
    ),
  },
  { path: '/invoicing', element: <AppShell><Breadcrumb /><InvoicingPage /></AppShell> },
  { path: '/invoicing/payments', element: <AppShell><Breadcrumb /><InvoicingPage /></AppShell> },
  { path: '/invoicing/payments/new', element: <AppShell><Breadcrumb /><PaymentFormPage /></AppShell> },
  { path: '/invoicing/payments/:id', element: <AppShell><Breadcrumb /><PaymentDetailPage /></AppShell> },
  { path: '/invoicing/:id', element: <AppShell><Breadcrumb /><InvoiceDetailPage /></AppShell> },
  { path: '/settings/organization', element: <AppShell><Breadcrumb /><OrganizationPage /></AppShell> },
  { path: '/users', element: <AppShell><Breadcrumb /><UsersPage /></AppShell> },
  { path: '/users/roles', element: <AppShell><Breadcrumb /><UsersPage /></AppShell> },
  { path: '/users/roles/:id', element: <AppShell><Breadcrumb /><RoleDetailPage /></AppShell> },
  { path: '/audit-log', element: <AppShell><Breadcrumb /><AuditLogPage /></AppShell> },
  { path: '/reports', element: <AppShell><Breadcrumb /><ReportsPage /></AppShell> },
  { path: '/profile', element: <AppShell><Breadcrumb /><PreviewProfilePage /></AppShell> },
  { path: '*', element: <Navigate to="/" replace /> },
];

/**
 * Routes (T088). Six destinations: overview, health panel, the products
 * catalogue, inventory, purchasing, and sales. There is no sign-in route, because this feature
 * has no authentication and a stub sign-in screen would imply one (research.md R-015).
 */
export const router = createBrowserRouter(routes);
