/**
 * The sample implementation of the service interface (T014).
 *
 * It exists so the interface's LIST, DETAIL and MUTATION halves are exercised in
 * memory rather than only declared, and so the gallery can be reviewed without a
 * backend (FR-068). Swapping it for the REST client later changes no component
 * (FR-036, FR-037).
 *
 * **Nothing persists.** The store is module-scoped, a mutation changes it and
 * nothing else, and there is no `localStorage`, `sessionStorage`, IndexedDB or
 * cookie anywhere in this file. A reload restores the initial rows, which is the
 * point: a demonstration that wrote to browser storage would be indistinguishable
 * from a saved change (FR-068, Principle III).
 *
 * Two rules that are easy to get wrong and are load-bearing here:
 *
 *  - **Sorting money never converts it to a number.** `compareDecimal` compares
 *    the strings digit by digit, because `Number('0.1') + Number('0.2')` is not
 *    `0.3` and an ordering that disagrees with the server's is a defect
 *    (Principle IV, FR-039).
 *  - **The simulated 429 is recognisable by the same rule as a real one.** The
 *    failing code and its status come from the shared `ERROR_CODE_STATUS` table
 *    rather than being written out here, and `catalog-service.spec.ts` asserts
 *    that `isRateLimited` - the one definition of "this is a rate limit", shared
 *    with the health panel - classifies it, so the error state the gallery
 *    reviews is the one the real client produces (research.md R-007, FR-069).
 */

import { DEFAULT_ERROR_MESSAGES, ERROR_CODES, ERROR_CODE_STATUS } from '@nexuserp/shared';

import type { ApiFailure } from '../lib/api-client';
import { compareDecimal } from '../lib/format';
import { SAMPLE_RECORDS } from '../mocks/sample-data';
import type {
  CatalogService,
  ListQuery,
  Page,
  RemoveRecordInput,
  RemoveRecordResult,
  SampleRecord,
} from './catalog-service';

/** The three operations this service performs. Recorded in the call log. */
export type CatalogOperation = 'listRecords' | 'getRecord' | 'removeRecord';

/** One recorded call. Read by the every-enabled-control guard (FR-071). */
export interface CallRecord {
  readonly operation: CatalogOperation;
  /** Monotonic, so a guard can assert that a NEW call happened, not just that one exists. */
  readonly sequence: number;
  /** What was asked for, e.g. `page 2 size 5` or the record id. */
  readonly detail: string;
}

/**
 * Which failure `simulateFailure` produces.
 *
 * A rate limit is a distinct kind rather than a second switch, because FR-069
 * asks for two labelled controls and the 429 is a case of "the call failed", not
 * a separate demonstration.
 */
export type FailureKind = 'error' | 'rate-limit';

/** How long `simulateSlowResponse` delays a call, in milliseconds. */
const SLOW_RESPONSE_MS = 600;

/** What the simulated rate limit tells the caller to wait. Not a real limit. */
const RATE_LIMIT_RETRY_AFTER_SECONDS = 30;

/**
 * A rejection that is also an `ApiFailure`.
 *
 * It extends `Error` so test tooling and `rejects.toThrow` behave normally, and it
 * carries the failure's own fields so a caller reads `status` and `requestId`
 * directly rather than unwrapping a property. That is what makes "the rejection
 * carries `status: 429`" literally true (FR-069).
 */
export class SampleServiceFailure extends Error implements ApiFailure {
  readonly code: ApiFailure['code'];
  readonly details: ApiFailure['details'];
  readonly requestId: string;
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = 'SampleServiceFailure';
    this.code = failure.code;
    this.details = failure.details;
    this.requestId = failure.requestId;
    this.status = failure.status;
    this.retryAfterSeconds = failure.retryAfterSeconds;
  }
}

/** The sample implementation's own surface: the interface plus the review-only extras. */
export interface SampleCatalogService extends CatalogService {
  /** When on, the next call rejects (FR-069). */
  simulateFailure: boolean;
  /** Which failure `simulateFailure` produces (FR-069). */
  failureKind: FailureKind;
  /** When on, the next call is delayed so the loading state is visible (FR-069). */
  simulateSlowResponse: boolean;
  /** Every call made, oldest first. Read by the guard (FR-071). */
  readonly calls: readonly CallRecord[];
  /** Restores the initial rows and switches. Used by tests; nothing is persisted. */
  reset(): void;
}

// --- module-scoped in-memory state -----------------------------------------

let rows: SampleRecord[] = SAMPLE_RECORDS.map((record) => ({ ...record }));
let callLog: CallRecord[] = [];
let callSequence = 0;
let requestSequence = 0;

const controls = {
  simulateFailure: false,
  failureKind: 'error' as FailureKind,
  simulateSlowResponse: false,
};

function nextRequestId(): string {
  requestSequence += 1;
  return `sample-request-${requestSequence}`;
}

/**
 * A failure with a request identifier and a message safe to display - the same
 * shape `src/lib/api-client.ts` produces, so the UI has one thing to handle
 * (FR-021, FR-026).
 */
function buildFailure(kind: FailureKind): ApiFailure {
  const requestId = nextRequestId();

  if (kind === 'rate-limit') {
    return {
      code: ERROR_CODES.TOO_MANY_REQUESTS,
      message: DEFAULT_ERROR_MESSAGES[ERROR_CODES.TOO_MANY_REQUESTS],
      details: [],
      requestId,
      // The status comes from the shared table rather than being written beside
      // the code, so a code can never travel with the wrong status.
      status: ERROR_CODE_STATUS[ERROR_CODES.TOO_MANY_REQUESTS],
      retryAfterSeconds: RATE_LIMIT_RETRY_AFTER_SECONDS,
    };
  }

  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: DEFAULT_ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR].replace('{requestId}', requestId),
    details: [],
    requestId,
    status: ERROR_CODE_STATUS[ERROR_CODES.INTERNAL_ERROR],
    retryAfterSeconds: null,
  };
}

function notFound(requestId: string): ApiFailure {
  return {
    code: ERROR_CODES.NOT_FOUND,
    message: DEFAULT_ERROR_MESSAGES[ERROR_CODES.NOT_FOUND],
    details: [],
    requestId,
    status: ERROR_CODE_STATUS[ERROR_CODES.NOT_FOUND],
    retryAfterSeconds: null,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Records the call before it can fail, so a rejected call is still observable. */
function record(operation: CatalogOperation, detail: string): void {
  callSequence += 1;
  callLog.push({ operation, sequence: callSequence, detail });
}

/**
 * The one gate every operation passes through, so the switches cannot be honoured
 * by one operation and forgotten by another.
 */
async function beforeCall(operation: CatalogOperation, detail: string): Promise<void> {
  record(operation, detail);

  if (controls.simulateSlowResponse) {
    await delay(SLOW_RESPONSE_MS);
  }

  if (controls.simulateFailure) {
    throw new SampleServiceFailure(buildFailure(controls.failureKind));
  }
}

/** Sorts a copy of the rows. Money is compared as a decimal string (Principle IV). */
function sorted(records: readonly SampleRecord[], query: ListQuery): SampleRecord[] {
  const sort = query.sort;
  if (sort === undefined || sort === '') return [...records];

  const sign = query.direction === 'desc' ? -1 : 1;
  const key = sort as keyof SampleRecord;

  return [...records].sort((a, b) => {
    if (key === 'amount') return compareDecimal(a.amount, b.amount, 2) * sign;
    return String(a[key]).localeCompare(String(b[key]), undefined, { sensitivity: 'base' }) * sign;
  });
}

async function listRecords(query: ListQuery): Promise<Page<SampleRecord>> {
  await beforeCall('listRecords', `page ${query.page} size ${query.pageSize}`);

  const ordered = sorted(rows, query);
  const start = Math.max(0, (query.page - 1) * query.pageSize);

  return {
    items: ordered.slice(start, start + query.pageSize),
    // The count of the whole set, not of the page. A pager given the page's own
    // length cannot render a total or decide whether a next page exists (FR-025).
    total: ordered.length,
  };
}

async function getRecord(id: string): Promise<SampleRecord> {
  await beforeCall('getRecord', id);

  const found = rows.find((record) => record.id === id);
  if (found === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  return { ...found };
}

async function removeRecord(input: RemoveRecordInput): Promise<RemoveRecordResult> {
  await beforeCall('removeRecord', input.id);

  const index = rows.findIndex((record) => record.id === input.id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  // Removed from the module-scoped list and nothing else. A resolved mutation
  // returns a label, never the record, so nothing here reads as committed.
  const [removed] = rows.splice(index, 1);
  return { removedLabel: removed.name };
}

function reset(): void {
  rows = SAMPLE_RECORDS.map((record) => ({ ...record }));
  callLog = [];
  callSequence = 0;
  requestSequence = 0;
  controls.simulateFailure = false;
  controls.failureKind = 'error';
  controls.simulateSlowResponse = false;
}

/**
 * The one instance the application reads. The switches live on the instance so
 * the gallery can flip them without a setter per switch.
 */
export const sampleCatalogService: SampleCatalogService = {
  listRecords,
  getRecord,
  removeRecord,
  get calls(): readonly CallRecord[] {
    return callLog;
  },
  get simulateFailure(): boolean {
    return controls.simulateFailure;
  },
  set simulateFailure(value: boolean) {
    controls.simulateFailure = value;
  },
  get failureKind(): FailureKind {
    return controls.failureKind;
  },
  set failureKind(value: FailureKind) {
    controls.failureKind = value;
  },
  get simulateSlowResponse(): boolean {
    return controls.simulateSlowResponse;
  },
  set simulateSlowResponse(value: boolean) {
    controls.simulateSlowResponse = value;
  },
  reset,
};
