/**
 * Which switchable module each Reports section draws its data from.
 * Module-neutral sections are absent from this map and always remain visible.
 */
export const REPORT_SECTION_MODULES: Readonly<Record<string, string>> = {
  totalSales: 'sales',
  totalOrders: 'sales',
  totalProducts: 'products',
  outstandingInvoices: 'invoicing',
  salesOverview: 'sales',
  salesByCategory: 'sales',
  topProducts: 'sales',
};
