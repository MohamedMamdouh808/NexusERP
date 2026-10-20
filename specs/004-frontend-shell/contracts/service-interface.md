# Contract: Service interface

The seam through which the interface obtains its data. Implemented today by sample data and
later by the real REST client, with no component changing (spec FR-036, FR-037).

Live location: `frontend/src/services/catalog-service.ts`.

## Shape

All operations are **asynchronous**. A list returns a page and a total; a detail returns one
record; a mutation returns a result. No operation returns a committed business record
(FR-037, Principle III).

```ts
import type { DecimalString } from '@nexuserp/shared'; // wherever a contract exists (FR-038)

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface ListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

export interface SampleRecord {
  readonly id: string;
  readonly name: string;
  readonly status: string;          // an API status name, verbatim (FR-022)
  readonly amount: DecimalString;   // decimal STRING, never a number (FR-039)
}

export interface CatalogService {
  listRecords(query: ListQuery): Promise<Page<SampleRecord>>;
  getRecord(id: string): Promise<SampleRecord>;
  /** Removes the sample row in memory; resolves with the removed record's label
   *  so a toast can name it (FR-068). */
  removeRecord(input: { readonly id: string }): Promise<{ readonly removedLabel: string }>;
}
```

## Rules

- **No persistence.** The implementation writes nothing to `localStorage`, `sessionStorage`,
  IndexedDB or a cookie; a reload restores the initial state (FR-068).
- **Mutation is in memory only.** A resolved mutation must never be presented as a committed
  record (Principle III).
- **Types come from the shared package** wherever a contract exists there; a type already
  defined by `@nexuserp/shared` must not be restated locally (FR-038).
- **Money is a decimal string.** The implementation and its fixtures never carry a
  floating-point money value; a test fails if one is introduced (FR-039, SC-010).

## Sample implementation extras (not part of the interface the real client must satisfy)

The sample implementation additionally exposes, for review only:

| Member | Effect |
|---|---|
| `simulateFailure: boolean` | The next call rejects with a request identifier (FR-069) |
| `simulateSlowResponse: boolean` | The next call is delayed, so the loading state is visible (FR-069) |
| `calls: CallRecord[]` | A log of calls made, read by the every-enabled-control guard (FR-071) |

When `simulateFailure` is on and the simulated failure is a rate limit, the rejection carries
`status: 429` so the existing `isRateLimited` handling and `Retry-After` path are exercised
(R-007).

## Verification

- A test asserts the interface is implemented by the sample implementation and that a component
  importing sample data directly fails a lint/guard check (FR-036).
- The every-enabled-control guard reads `calls` to detect an observable service call (FR-071).
- The gallery's flows assert: confirming a dialog removes the row, the toast names the removed
  record, a menu action runs, and the organization switch changes the active sample
  organization (FR-068, SC-017).
