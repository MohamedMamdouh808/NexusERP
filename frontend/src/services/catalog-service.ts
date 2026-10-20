/**
 * The service interface - the seam between the interface and its data (T012).
 *
 * Constitution Principle VI and FR-036: sample data lives in one place and is
 * reached only through this interface. No component imports `src/mocks` and no
 * component decides where its data came from, which is what lets the real REST
 * client replace `sample-catalog-service.ts` later without a component changing
 * (FR-036, FR-037).
 *
 * Every operation is asynchronous and shaped like the call the real client will
 * make: a list returns a page AND a total, a detail returns one record, and a
 * mutation returns a RESULT. The mutation deliberately does not return a
 * committed record - nothing here is posted, issued or immutable, and returning
 * the record would present a sample change as a saved one (Principle III,
 * FR-037).
 *
 * Money is a decimal STRING throughout (FR-039, Principle IV). `DecimalString`
 * is the shared package's own type rather than a local restatement (FR-038).
 */

import type { DecimalString } from '@nexuserp/shared';

/** One page of a list, with the total the server counted - never the page's own length. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * A list request as the server takes it: the page, the size, and an optional
 * sort. Paging is the server's decision, so the interface asks for a page rather
 * than slicing an array it already holds (FR-025).
 */
export interface ListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** A value that stands in for a real record so the interface can be reviewed. */
export interface SampleRecord {
  readonly id: string;
  /** An API status name, verbatim. The interface never invents or rewords one (FR-022). */
  readonly status: string;
  readonly name: string;
  /** A decimal string. A JavaScript number would lose precision on an amount (FR-039). */
  readonly amount: DecimalString;
}

/** The input of the one mutation the gallery exercises. */
export interface RemoveRecordInput {
  readonly id: string;
}

/**
 * What a mutation resolves with. A label rather than the removed record, so a
 * caller can name what it removed without being handed something that looks like
 * a committed row (Principle III).
 */
export interface RemoveRecordResult {
  readonly removedLabel: string;
}

export type DashboardPeriod = 'this-month' | 'last-month';

export interface DashboardMetric<T> {
  readonly value: T;
  readonly changeDirection: 'up' | 'down';
  /** Precomputed in sample data; never derived from a money amount in the UI. */
  readonly changePercent: number;
  readonly measure: string;
}

export interface DashboardActivity {
  readonly [key: string]: unknown;
  readonly id: string;
  readonly time: string;
  readonly activity: string;
  readonly category: 'Sales' | 'Orders' | 'Inventory' | 'Invoices';
  readonly user: string;
  /** Verbatim API status name. */
  readonly status: string;
}

export interface DashboardSummary {
  readonly period: DashboardPeriod;
  readonly sales: DashboardMetric<DecimalString>;
  readonly activeOrders: DashboardMetric<number>;
  readonly lowStockItems: DashboardMetric<number>;
  readonly outstandingInvoices: DashboardMetric<DecimalString>;
  readonly topSellingProducts: readonly { readonly product: string; readonly unitsSold: number }[];
  readonly salesOrdersTrend: readonly {
    readonly date: string;
    readonly sales: DecimalString;
    readonly orders: number;
  }[];
  readonly ordersByStatus: readonly {
    readonly status: 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';
    readonly count: number;
  }[];
  readonly recentActivity: readonly DashboardActivity[];
  readonly empty: boolean;
}

export interface DashboardQuerySwitches {
  /** Returns an honest first-use result with no dashboard records. */
  readonly empty: boolean;
}

/**
 * The interface the sample implementation satisfies today and the REST client
 * satisfies later. It stays focused on the dashboard summary and the list,
 * detail, and mutation operations the shell and gallery exercise.
 */
export interface CatalogService {
  getDashboardSummary(period: DashboardPeriod): Promise<DashboardSummary>;
  listRecords(query: ListQuery): Promise<Page<SampleRecord>>;
  getRecord(id: string): Promise<SampleRecord>;
  /** Removes the sample row in memory; resolves with the removed record's label
   *  so a toast can name it (FR-068). */
  removeRecord(input: RemoveRecordInput): Promise<RemoveRecordResult>;
}
