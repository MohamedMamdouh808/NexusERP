/**
 * Every sample value the interface can show, in one place (T013).
 *
 * FR-036 and data-model.md section 7: sample data lives HERE and nowhere else,
 * and reaches a component only through `src/services/`. A component that imports
 * this module directly is a defect, checked by
 * `src/components/__tests__/no-direct-sample-imports.spec.ts` (T060).
 *
 * Two rules this file must not break:
 *
 *  1. **Money is a decimal string.** `'1250.00'`, never `1250.00`. A JavaScript
 *     number is IEEE-754 binary floating point and cannot represent most decimal
 *     fractions exactly, so an amount that passes through one can differ from the
 *     server's by a fraction of a unit (Principle IV, FR-039). The values here are
 *     strings all the way to the formatter, which does no arithmetic on them.
 *
 *  2. **A status is an API status name, verbatim.** The names below are the design
 *     system's status mapping and the values the API returns; the interface never
 *     invents, abbreviates or rewords one, and colour is never the only signal
 *     (FR-022, FR-044).
 *
 * Nothing here is real: no organization, person or document is represented, and
 * every surface that shows one of these values carries the "Sample data" marker
 * (FR-040, FR-041).
 */

import type { DashboardPeriod, DashboardSummary, SampleRecord } from '../services/catalog-service';
import type { PreviewUser, SampleOrganization } from '../services/shell-service';

export const SAMPLE_ORGANIZATIONS: readonly SampleOrganization[] = [
  { id: 'sample-org-alpha', name: 'Sample Organization (Alpha)' },
  { id: 'sample-org-beta', name: 'Sample Organization (Beta)' },
];

/** The organization the shell starts on. Only ever one of `SAMPLE_ORGANIZATIONS`. */
export const SAMPLE_DEFAULT_ORGANIZATION_ID = SAMPLE_ORGANIZATIONS[0].id;

export const SAMPLE_PREVIEW_USER: PreviewUser = {
  id: 'sample-user-preview',
  name: 'Preview user',
  role: 'Not signed in',
};

/**
 * The sample rows. Twelve, so a page size of five produces three pages and the
 * pager and the "page after the first" state are reachable without special-casing.
 *
 * The statuses are chosen to cover the design system's status mapping rather than
 * to describe a plausible document history: every one of the five badge tones is
 * represented, so the mapping is demonstrated rather than asserted (FR-022, FR-044).
 */
export const SAMPLE_RECORDS: readonly SampleRecord[] = [
  { id: 'sample-0001', status: 'DRAFT', name: 'Heavy-duty shelving unit', amount: '1250.00' },
  { id: 'sample-0002', status: 'CONFIRMED', name: 'Pallet wrapping film', amount: '384.50' },
  {
    id: 'sample-0003',
    status: 'PARTIALLY_RECEIVED',
    name: 'Barcode scanner, cordless',
    amount: '2199.99',
  },
  { id: 'sample-0004', status: 'RECEIVED', name: 'Thermal label roll', amount: '96.00' },
  { id: 'sample-0005', status: 'CANCELLED', name: 'Forklift hire, one week', amount: '1875.00' },
  { id: 'sample-0006', status: 'PAID', name: 'Steel pallet, galvanised', amount: '4300.00' },
  { id: 'sample-0007', status: 'ISSUED', name: 'Safety glove, cut-resistant', amount: '612.75' },
  {
    id: 'sample-0008',
    status: 'PARTIALLY_PAID',
    name: 'Racking inspection service',
    amount: '780.40',
  },
  { id: 'sample-0009', status: 'VOID', name: 'Obsolete stock write-off', amount: '0.00' },
  { id: 'sample-0010', status: 'SHIPPED', name: 'Wooden pallet collar', amount: '145.20' },
  { id: 'sample-0011', status: 'ACTIVE', name: 'Reserved: dispatch crate', amount: '308.00' },
  { id: 'sample-0012', status: 'CONSUMED', name: 'Consumed: packing tape', amount: '57.85' },
];

/** Precomputed sample dashboard summaries; money stays in decimal-string form. */
export const SAMPLE_DASHBOARD_SUMMARIES: Readonly<Record<DashboardPeriod, DashboardSummary>> = {
  'this-month': {
    period: 'this-month',
    sales: {
      value: '128450.75',
      changeDirection: 'up',
      changePercent: 12.8,
      measure: 'Issued invoice totals for this month',
    },
    activeOrders: {
      value: 24,
      changeDirection: 'up',
      changePercent: 14.3,
      measure: 'Confirmed orders awaiting shipment',
    },
    lowStockItems: {
      value: 7,
      changeDirection: 'down',
      changePercent: 12.5,
      measure: 'Items at or below their reorder threshold',
    },
    outstandingInvoices: {
      value: '34200.00',
      changeDirection: 'down',
      changePercent: 4.6,
      measure: 'Unpaid balance across issued invoices',
    },
    topSellingProducts: [
      { product: 'Packing tape', unitsSold: 486 },
      { product: 'Thermal labels', unitsSold: 392 },
      { product: 'Pallet wrap', unitsSold: 318 },
      { product: 'Safety gloves', unitsSold: 246 },
      { product: 'Barcode scanners', unitsSold: 174 },
    ],
    salesOrdersTrend: [
      { date: 'Week 1', sales: '25420.00', orders: 20 },
      { date: 'Week 2', sales: '26680.50', orders: 25 },
      { date: 'Week 3', sales: '25240.25', orders: 21 },
      { date: 'Week 4', sales: '28860.00', orders: 30 },
      { date: 'Week 5', sales: '22250.00', orders: 33 },
    ],
    ordersByStatus: [
      { status: 'DRAFT', count: 8 },
      { status: 'CONFIRMED', count: 24 },
      { status: 'SHIPPED', count: 90 },
      { status: 'CANCELLED', count: 7 },
    ],
    recentActivity: [
      {
        id: 'activity-1',
        time: '10:42',
        activity: 'SO-1042 confirmed',
        category: 'Orders',
        user: 'Amina Hassan',
        status: 'CONFIRMED',
      },
      {
        id: 'activity-2',
        time: '10:18',
        activity: 'INV-208 issued',
        category: 'Invoices',
        user: 'Omar Nabil',
        status: 'ISSUED',
      },
      {
        id: 'activity-3',
        time: '09:56',
        activity: 'Packing tape threshold reached',
        category: 'Inventory',
        user: 'Mariam Adel',
        status: 'ACTIVE',
      },
      {
        id: 'activity-4',
        time: '09:31',
        activity: 'SO-1038 shipped',
        category: 'Orders',
        user: 'Youssef Samir',
        status: 'SHIPPED',
      },
      {
        id: 'activity-5',
        time: '09:14',
        activity: 'INV-205 payment recorded',
        category: 'Sales',
        user: 'Amina Hassan',
        status: 'PAID',
      },
      {
        id: 'activity-6',
        time: '08:48',
        activity: 'SO-1045 saved as draft',
        category: 'Orders',
        user: 'Omar Nabil',
        status: 'DRAFT',
      },
      {
        id: 'activity-7',
        time: '08:20',
        activity: 'INV-201 cancelled',
        category: 'Invoices',
        user: 'Mariam Adel',
        status: 'CANCELLED',
      },
    ],
    empty: false,
  },
  'last-month': {
    period: 'last-month',
    sales: {
      value: '113870.20',
      changeDirection: 'down',
      changePercent: 3.4,
      measure: 'Issued invoice totals for last month',
    },
    activeOrders: {
      value: 21,
      changeDirection: 'down',
      changePercent: 8.7,
      measure: 'Confirmed orders awaiting shipment',
    },
    lowStockItems: {
      value: 8,
      changeDirection: 'up',
      changePercent: 14.3,
      measure: 'Items at or below their reorder threshold',
    },
    outstandingInvoices: {
      value: '35850.00',
      changeDirection: 'up',
      changePercent: 5.1,
      measure: 'Unpaid balance across issued invoices',
    },
    topSellingProducts: [
      { product: 'Thermal labels', unitsSold: 438 },
      { product: 'Packing tape', unitsSold: 405 },
      { product: 'Safety gloves', unitsSold: 301 },
      { product: 'Pallet wrap', unitsSold: 284 },
      { product: 'Barcode scanners', unitsSold: 166 },
    ],
    salesOrdersTrend: [
      { date: 'Week 1', sales: '22240.00', orders: 22 },
      { date: 'Week 2', sales: '22480.00', orders: 20 },
      { date: 'Week 3', sales: '24930.20', orders: 25 },
      { date: 'Week 4', sales: '23620.00', orders: 20 },
      { date: 'Week 5', sales: '20600.00', orders: 20 },
    ],
    ordersByStatus: [
      { status: 'DRAFT', count: 10 },
      { status: 'CONFIRMED', count: 21 },
      { status: 'SHIPPED', count: 70 },
      { status: 'CANCELLED', count: 6 },
    ],
    recentActivity: [
      {
        id: 'activity-8',
        time: '16:22',
        activity: 'INV-198 issued',
        category: 'Invoices',
        user: 'Omar Nabil',
        status: 'ISSUED',
      },
      {
        id: 'activity-9',
        time: '15:50',
        activity: 'SO-1019 shipped',
        category: 'Orders',
        user: 'Amina Hassan',
        status: 'SHIPPED',
      },
      {
        id: 'activity-10',
        time: '15:17',
        activity: 'Scanner stock replenished',
        category: 'Inventory',
        user: 'Youssef Samir',
        status: 'RECEIVED',
      },
      {
        id: 'activity-11',
        time: '14:43',
        activity: 'SO-1027 confirmed',
        category: 'Orders',
        user: 'Mariam Adel',
        status: 'CONFIRMED',
      },
      {
        id: 'activity-12',
        time: '14:10',
        activity: 'INV-194 payment recorded',
        category: 'Sales',
        user: 'Omar Nabil',
        status: 'PAID',
      },
      {
        id: 'activity-13',
        time: '13:32',
        activity: 'SO-1031 saved as draft',
        category: 'Orders',
        user: 'Amina Hassan',
        status: 'DRAFT',
      },
      {
        id: 'activity-14',
        time: '12:54',
        activity: 'INV-190 cancelled',
        category: 'Invoices',
        user: 'Youssef Samir',
        status: 'CANCELLED',
      },
    ],
    empty: false,
  },
};
