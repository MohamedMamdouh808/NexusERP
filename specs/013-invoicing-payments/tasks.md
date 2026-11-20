# Tasks: Invoicing and Payments end to end

**Input**: Design documents from `/specs/013-invoicing-payments/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md (decisions D-001…D-020), data-model.md, contracts/invoicing-api.md, quickstart.md

**Branch**: `013-invoicing-payments` · **Created**: 2026-11-14

**Tests**: Mandatory for this project (Constitution Principle V). Every user story includes tests written FIRST and observed failing before implementation. The critical-path tests run against the real PostgreSQL instance in the isolated `nexuserp_test` schema only (`connection_limit=5`); the public schema's row counts must be unchanged afterwards. Run suites grouped, never concurrently.

**Organization**: Tasks are grouped by user story so each can be implemented, tested and delivered independently.

- **US1** (P1, MVP): create, issue and void an invoice from a shipped order
- **US2** (P1): record a payment with allocations
- **US3** (P1): reverse a payment
- **US4** (P1): browse invoices and payments
- **US5** (P1): the Invoicing screens show real data
- **US6** (P1): protect customers referenced by open invoices

All six stories are P1. US1 is the MVP because nothing can be paid without an issued invoice. US2 builds on US1's invoices; US3 reverses US2's payments; US4 reads every surface; US5 consumes every backend surface through the UI; US6 is the integrity contract (usage guard) and comes last.

## Phase 1: Setup (shared infrastructure)

**Purpose**: the shared vocabulary, the database foundation and the module gate every story depends on.

- [X] T001 [P] Add the new error codes `BALANCE_CHANGED` (409) and `INVOICE_ALREADY_EXISTS` (409) with status mappings, default messages and entries in the emittable-code set, in `shared/src/errors/index.ts`; `OVER_ALLOCATION`, `INVOICE_HAS_PAYMENTS`, `CONTACT_IN_USE`, `STALE_VERSION`, `INVALID_STATE_TRANSITION`, `VALIDATION_ERROR` and `IDEMPOTENCY_KEY_REUSED` already exist (research D-013).
- [X] T002 [P] Add the invoicing audit actions `invoices.created`, `invoices.updated`, `invoices.issued`, `invoices.voided`, `payments.recorded`, `payments.reversed` to the shared audit catalogue in `shared/src/audit/index.ts` (research D-013).
- [X] T003 [P] Verify the seeded RBAC catalogue and role templates already resolve the invoicing permissions (`invoices.read/write/issue/void`, `payments.read/record/reverse`) for Administrator and Manager, and `invoices.read` for Sales; extend the seed/backfill only if a code is missing, in `shared/src/permissions/index.ts` and its backfill migration.
- [X] T004 Extend the Prisma schema with the `Invoice`, `InvoiceLine`, `Payment`, `PaymentAllocation` and `PaymentReversal` models — snake_case `@map` columns, `organization_id` on every table, composite unique keys `(organization_id, id)`, precisions per data-model.md — and add `Organization.defaultPaymentTermsDays` in `database/prisma/schema.prisma`.
- [X] T005 Migration (additive, never editing an existing one) adding `default_payment_terms_days integer NOT NULL DEFAULT 30` with check 0..365 — in `database/prisma/migrations/20261115000001_organizations_default_payment_terms_days/migration.sql`.
- [X] T006 Migration creating `invoices`: status check over the five API names, `total >= 0`, composite FKs to sales orders and contacts, partial unique `(organization_id, sales_order_id) WHERE status <> 'VOID'`, unique `(organization_id, number) WHERE number IS NOT NULL`, the ISSUED/PARTIALLY_PAID/PAID requires-number-issue-date-due-date check, indexes, RLS enabled with no policies — in `database/prisma/migrations/20261115000002_invoices/migration.sql`.
- [X] T007 Migration creating `invoice_lines`: quantity > 0, unit price >= 0, line total >= 0, unique `(organization_id, invoice_id, product_id)`, composite FKs, indexes, RLS — in `database/prisma/migrations/20261115000003_invoice_lines/migration.sql`.
- [X] T008 Migration installing the `invoices_immutability` trigger (header immutable once not DRAFT, the allowed transition map, void fields set only entering VOID, version only increases, created fields never updatable) and the insert-only `invoice_lines` trigger — in `database/prisma/migrations/20261115000004_invoices_immutability/migration.sql` (research D-010).
- [X] T009 Migration creating `payments`: amount > 0, payment date, method check `CASH|BANK_TRANSFER|CARD|OTHER`, unique `(organization_id, number)`, indexes, composite FKs, RLS — in `database/prisma/migrations/20261115000005_payments/migration.sql`.
- [X] T010 Migration creating `payment_allocations`: amount > 0, unique `(organization_id, payment_id, invoice_id)`, indexes on `(organization_id, invoice_id)` and `(organization_id, payment_id)`, composite FKs, RLS — in `database/prisma/migrations/20261115000006_payment_allocations/migration.sql`.
- [X] T011 Migration creating `payment_reversals`: reason non-empty, unique `(organization_id, payment_id)`, index on `(organization_id, payment_id)`, composite FKs, RLS — in `database/prisma/migrations/20261115000007_payment_reversals/migration.sql`.
- [X] T012 Migration installing the append-only enforcement for the payments trio in ONE step: BEFORE UPDATE/DELETE triggers raising on `payments`, `payment_allocations`, `payment_reversals`, plus REVOKE UPDATE, DELETE, TRUNCATE from PUBLIC and from `service_role`/`authenticated`/`anon` guarded by role existence — in `database/prisma/migrations/20261115000008_payments_append_only/migration.sql` (research D-010).
- [X] T013 Migration creating the `invoice_balances` view (organization_id, invoice_id, total, allocated = sum of allocations of payments with no reversal, balance, is_overdue = due_date < (now() AT TIME ZONE 'UTC')::date AND balance > 0) with read-only-consistent grants — in `database/prisma/migrations/20261115000009_invoice_balances_view/migration.sql` (research D-002, D-016).
- [X] T014 Migration enabling RLS with no policies on `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `payment_reversals` — in `database/prisma/migrations/20261115000010_invoicing_rls/migration.sql`.
- [X] T015 [P] Implement the shared Invoicing module gate: one guard named for the module that currently allows every request and reads its own metadata key, so the Organization settings feature can enable the module-disabled check in one place — in `backend/src/common/guards/invoicing-module.guard.ts` (mirror `sales-module.guard.ts`; FR-029, SC-015).

**Checkpoint**: the schema, its constraints and its protections exist; the migration history, RLS and naming checks pass. (The `document_sequences` kinds `invoice`/`payment` need no migration; rows are created on first use.)

---

## Phase 2: Foundational (blocking prerequisites for every story)

**Purpose**: the pieces all stories share — the module skeleton, the number allocation, the Sales order read, the organizations read, the usage answer seam, and the interface's client seam.

- [X] T016 Create the invoicing module skeleton with its dependency wiring (transaction service, audit service, idempotency service) and register it in `backend/src/app.module.ts`: `backend/src/modules/invoicing/invoicing.module.ts`, `backend/src/modules/invoicing/invoicing.service.ts`, `backend/src/modules/invoicing/invoicing.controller.ts`.
- [X] T017 [P] Implement the INV- and PAY- number allocation: find-or-create the `document_sequences` row (kinds `invoice`, `payment`), per-organization `pg_advisory_xact_lock(hashtext('<organizationId>:<name>'))`, increment, six-digit format, inside the caller's transaction; invoice numbers allocated at issue, payment numbers at creation — in `backend/src/modules/invoicing/invoice-number.ts` (pattern: `backend/src/modules/sales/sales-number.ts`; research D-007).
- [X] T018 [P] Add the Sales-owned order read used by invoice creation: fetch the order with its lines inside the caller's transaction, refuse a non-SHIPPED order with 409 `INVALID_STATE_TRANSITION`; Invoicing never writes Sales tables — in `backend/src/modules/sales/sales.service.ts` (research D-001).
- [X] T019 [P] Expose `defaultPaymentTermsDays` (integer, default 30) read-only on `GET /organizations/current` next to `currencyCode` in `backend/src/modules/organizations/organizations.service.ts` (research D-015; no write path in this feature).
- [X] T020 [P] Add the Invoicing-owned usage answer seam: an invoicing usage service exposing "open invoice count for customer" (DRAFT/ISSUED/PARTIALLY_PAID) that Contacts will call — in `backend/src/modules/invoicing/invoicing-usage.service.ts` (wired in T078; research D-001/VI).
- [X] T021 [P] Create the real Invoicing API client behind the seam, with the shared request/error mapping, the `Idempotency-Key` header for issue/void/record/reverse, the version-carrying draft update and `expectedBalance` on allocations — in `frontend/src/services/invoicing-client.ts` (pattern: `frontend/src/services/sales-client.ts`).
- [X] T022 [P] Change the interface's invoicing types on the service seam to the real contract — invoice row/detail, payment row/detail with computed status, list payloads carrying `outstanding`/`overdue` — in `frontend/src/services/catalog-service.ts`.
- [X] T023 [P] Delete the Invoicing sample data and remove the SampleDataBanner from the Invoicing screens; point `frontend/src/features/invoicing/use-invoicing.ts` at the real Invoicing client instead of `sampleCatalogService`; the Overview module keeps its private sample data — in `frontend/src/mocks/`, `frontend/src/services/sample-catalog-service.ts` (research D-019; FR-032, FR-038).

**Checkpoint**: foundation ready — every user story can now begin.

---

## Phase 3: User Story 1 — Create, issue, and void an invoice from a shipped order (Priority: P1) 🎯 MVP

**Goal**: `POST /sales-orders/:id/invoices`, `PUT /invoices/:id`, `POST /invoices/:id/issue` and `POST /invoices/:id/void` steer a draft into an issued, numbered, immutable invoice — or a void that frees the order for re-invoicing.

**Independent Test**: from a SHIPPED order create the draft, change only its due date, issue it (verify `INV-` number, issue date, due-date resolution), void it with a reason, and confirm the order can be invoiced again; a non-SHIPPED order, a second invoice on one order, a stale version and a missing reason are each refused with the documented code.

### Tests for User Story 1 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T024 [P] [US1] Integration test — create from a SHIPPED order saves a DRAFT carrying the order's customer, lines, quantities and unit prices with server-calculated half-up line totals and a total equal to the order's; number null; audit entry commits in the same transaction; a failure anywhere rolls back to nothing — in `backend/test/integration/invoicing-create.spec.ts`.
- [X] T025 [P] [US1] Integration test — create refusals and permissions: order of another organization → 404; not SHIPPED → 409 `INVALID_STATE_TRANSITION`; a non-void invoice already exists → 409 `INVOICE_ALREADY_EXISTS`; a VOID invoice does not block; a member with `invoices.write` but not `sales.read` CAN create; `sales.write` without `invoices.write` → 403 — in `backend/test/integration/invoicing-create.spec.ts`.
- [X] T026 [P] [US1] Integration test — draft update: only `dueDate` editable; due date before the creation date → 400 `VALIDATION_ERROR`; non-DRAFT → 409 `INVALID_STATE_TRANSITION`; stale version → 409 `STALE_VERSION`; success increments version with its audit entry; no Idempotency-Key required — in `backend/test/integration/invoicing-draft.spec.ts`.
- [X] T027 [P] [US1] Integration test — issue: `INV-` six-digit number allocated in the transaction; issue date today UTC; due date resolves request value → draft's kept → issue date + `default_payment_terms_days`; a due date before the issue date (request or draft) → 400 `VALIDATION_ERROR`; status ISSUED; audit entry; same key + same body returns the stored response; different body → 422 `IDEMPOTENCY_KEY_REUSED`; missing key → 400 — in `backend/test/integration/invoicing-issue.spec.ts`.
- [X] T028 [P] [US1] Integration test — double issue concurrency: two simultaneous issues allocate exactly one number; the loser is refused 409 `INVALID_STATE_TRANSITION` — in `backend/test/integration/invoicing-issue.spec.ts`.
- [X] T029 [P] [US1] Integration test — void: DRAFT void succeeds; ISSUED with zero active allocations succeeds; ISSUED with allocations and PARTIALLY_PAID/PAID → 409 `INVOICE_HAS_PAYMENTS`; missing reason → 400; void sets reason/at/by together; VOID stays readable and its order is invoicable again; idempotent — in `backend/test/integration/invoicing-void.spec.ts`.
- [X] T030 [P] [US1] Integration test — immutability with direct SQL: once ISSUED, customer/order/lines/total/number/issue date reject UPDATE; only the allowed transition map passes; VOID terminal; `invoice_lines` reject UPDATE/DELETE/TRUNCATE; the payments trio reject UPDATE/DELETE/TRUNCATE and hold no API-role grants — in `backend/test/integration/invoicing-immutability.spec.ts`.
- [X] T031 [P] [US1] Integration test — tenant isolation and permissions across the invoice endpoints: another organization's record → 404 everywhere; reads need `invoices.read`, create/update `invoices.write`, issue `invoices.issue`, void `invoices.void`; every endpoint declares the module gate — in `backend/test/integration/invoicing-isolation.spec.ts`.

### Implementation for User Story 1 (depends on T024–T031 failing)

- [X] T032 [US1] Implement the invoice writes in `backend/src/modules/invoicing/invoicing.service.ts`: create (Sales service read inside the transaction, copied lines, per-line rounding, one-non-void-per-order guard with the partial unique index as second line of defence), draft update (DRAFT-only, version check), issue (lock, number allocation, due-date resolution per D-004, ISSUED, idempotency response), void (DRAFT or ISSUED with zero active allocations, reason required, `INVOICE_HAS_PAYMENTS` otherwise, idempotency response) — research D-004, D-006, D-007, D-009, D-011, D-017.
- [X] T033 [US1] Define the request/response DTOs (create body `{}`, draft update `{dueDate, version}`, issue `{dueDate?}`, void `{reason}`, invoice detail with lines/paymentsApplied/label) in `backend/src/modules/invoicing/dto/*.ts`.
- [X] T034 [US1] Expose `POST /sales-orders/:id/invoices`, `GET /invoices/:id`, `PUT /invoices/:id`, `POST /invoices/:id/issue`, `POST /invoices/:id/void` with their permissions, `Idempotency-Key` on issue/void, the module gate and OpenAPI annotations in `backend/src/modules/invoicing/invoicing.controller.ts`.
- [X] T035 [US1] Re-run the US1 integration tests green (`backend/test/integration/invoicing-*.spec.ts`).

**Checkpoint**: a shipped order can be invoiced, issued, and voided exactly once each, with a full audit trail.

---

## Phase 4: User Story 2 — Record a payment with allocations (Priority: P1)

**Goal**: `POST /payments` records a payment in ONE transaction — validates the exact-sum rule, locks the invoices in ascending id order, recomputes balances under the lock, refuses stale reads and over-allocation, and moves each invoice to PARTIALLY_PAID or PAID.

**Independent Test**: issue an invoice, record a partial payment allocated to it (verify PARTIALLY_PAID with exact balance), record the remainder (verify PAID at exactly zero); an over-allocation, a sum mismatch, a stale expected balance and a duplicate invoice each leave nothing written.

### Tests for User Story 2 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T036 [P] [US2] Integration test — record happy path: `PAY-` number at creation; payment + allocations created; invoices set PARTIALLY_PAID or PAID (PAID only at balance exactly zero); audit entry commits; vectors 0.10+0.20=0.30 and 128.45−(100.00, 28.45)=0.00 exact — in `backend/test/integration/payments-record.spec.ts`.
- [X] T037 [P] [US2] Integration test — refusals: allocation above the recomputed balance with matching expected → 400 `OVER_ALLOCATION`; allocations not summing exactly to the amount → 400 `VALIDATION_ERROR`; the same invoice twice → 400 `VALIDATION_ERROR`; DRAFT/VOID/PAID invoice, or another customer's/organization's invoice → 409; amount ≤ 0; payment date in the future (UTC); method outside the enum — in `backend/test/integration/payments-record.spec.ts`.
- [X] T038 [P] [US2] Integration test — stale read: a recomputed balance different from an allocation's `expectedBalance` → 409 `BALANCE_CHANGED` with `details { invoiceId, currentBalance }`; nothing written — in `backend/test/integration/payments-record.spec.ts`.
- [X] T039 [P] [US2] Integration test — concurrency: two simultaneous payments against one invoice never over-allocate (ascending invoice id lock; the later one refused or exact under the lock); a payment racing a void of the same invoice yields exactly one consistent outcome; no invoice ends PAID with a positive balance — in `backend/test/integration/payments-concurrency.spec.ts`.
- [X] T040 [P] [US2] Integration test — idempotency: same key + same body returns the stored response with no second posting; different body → 422 `IDEMPOTENCY_KEY_REUSED`; missing key → 400 `IDEMPOTENCY_KEY_REQUIRED` — in `backend/test/integration/payments-record.spec.ts`.
- [X] T041 [P] [US2] Integration test — rollback and append-only: a failure in payment insert, allocation insert, status update, audit write or idempotency storage leaves no payment, no allocation, no status change, no audit entry and no key record; direct SQL UPDATE/DELETE/TRUNCATE on the payments trio is refused — in `backend/test/integration/payments-record.spec.ts`.
- [X] T042 [P] [US2] Integration test — tenant isolation and permissions: record needs `payments.record`, reads need `payments.read`; another organization's payment or invoice → 404 — in `backend/test/integration/payments-record.spec.ts`.

### Implementation for User Story 2 (depends on T036–T042 failing)

- [X] T043 [US2] Implement `recordPayment` in `backend/src/modules/invoicing/invoicing.service.ts`: validate amount/date/method and the exact-sum rule; lock the invoices in ascending id order; recompute each balance under the lock from active allocations; compare with `expectedBalance` (409 `BALANCE_CHANGED`) then bound (400 `OVER_ALLOCATION`); create payment + allocations; set PARTIALLY_PAID/PAID; audit; store the idempotency response — research D-006, D-008, D-011.
- [X] T044 [US2] Define the record-payment request/response DTOs (allocations carrying `invoiceId`, `amount`, `expectedBalance`) in `backend/src/modules/invoicing/dto/record-payment.dto.ts`.
- [X] T045 [US2] Expose `POST /payments` with `@RequirePermission('payments.record')`, the required `Idempotency-Key` header, the module gate and OpenAPI annotations in `backend/src/modules/invoicing/invoicing.controller.ts`.
- [X] T046 [US2] Re-run the US2 integration tests green (`backend/test/integration/payments-record.spec.ts`, `payments-concurrency.spec.ts`).

**Checkpoint**: money enters exactly once; balances stay exact under concurrency.

---

## Phase 5: User Story 3 — Reverse a payment (Priority: P1)

**Goal**: `POST /payments/:id/reverse` appends a `payment_reversals` row (the payment row is never changed), restores each affected invoice's status from its remaining active allocations, and refuses a second reversal.

**Independent Test**: fully pay an invoice, reverse the payment with a reason — the payment row is unchanged, a reversal record exists, the invoice returns to ISSUED with its balance restored, and a second reversal is refused 409.

### Tests for User Story 3 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T047 [P] [US3] Integration test — reverse happy path: `payment_reversals` row created with reason/by/at; payment row unchanged; allocations stay visible labelled reversed; each affected invoice restored per remaining active allocations (PAID/PARTIALLY_PAID → ISSUED/PARTIALLY_PAID); audit entry commits; idempotency replay returns the stored response — in `backend/test/integration/payments-reverse.spec.ts`.
- [X] T048 [P] [US3] Integration test — refusals and isolation: a second reversal → 409; missing/empty reason → 400 `VALIDATION_ERROR`; another organization's payment → 404; `payments.reverse` required — in `backend/test/integration/payments-reverse.spec.ts`.
- [X] T049 [P] [US3] Integration test — consistency under race: a reversal racing a new payment on the same invoice yields one consistent final state (no resurrected PAID, no negative balance); a reversal of a payment partially allocated to several invoices restores only those invoices; a mid-write failure rolls everything back — in `backend/test/integration/payments-reverse.spec.ts`.

### Implementation for User Story 3 (depends on T047–T049 failing)

- [X] T050 [US3] Implement `reversePayment` in `backend/src/modules/invoicing/invoicing.service.ts`: lock affected invoices ascending id; insert the reversal row; recompute statuses; audit; store the idempotency response — research D-003, D-008, D-011.
- [X] T051 [US3] Define the reverse request DTO and the payment-detail response (allocations with `reversed`, the `reversal` block when present) in `backend/src/modules/invoicing/dto/reverse-payment.dto.ts` and `dto/payment-response.dto.ts`.
- [X] T052 [US3] Expose `POST /payments/:id/reverse` with `@RequirePermission('payments.reverse')`, `Idempotency-Key`, the module gate and OpenAPI annotations in `backend/src/modules/invoicing/invoicing.controller.ts`.
- [X] T053 [US3] Re-run the US3 integration tests green (`backend/test/integration/payments-reverse.spec.ts`).

**Checkpoint**: a mistaken payment is repaired by a compensating record, never by an edit.

---

## Phase 6: User Story 4 — Browse invoices and payments (Priority: P1)

**Goal**: `GET /invoices`, `GET /invoices/:id`, `GET /invoices/open`, `GET /payments`, `GET /payments/:id` — paginated, searchable, filterable reads with whole-selection totals and server-computed outstanding/overdue figures covering exactly the filtered selection.

**Independent Test**: search by number and customer, apply status and overdue filters, page through — every figure and the total describe the whole selection, not the page; the payments list combines the derived status filter with the method filter and its total always matches the rows.

### Tests for User Story 4 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T054 [P] [US4] Integration test — invoice list: search by number or customer name with wildcards treated literally; status filter over the five values; `overdue` filter (due before today UTC AND balance > 0); sort keys closed list (unknown key → 400 `VALIDATION_ERROR`; default `createdAt desc`, `id asc` tie-break); pageSize capped at 100; whole-selection `total`; `outstanding`/`overdue` cover the whole filtered selection regardless of page (rows/total/figures from one snapshot; unfiltered figures equal the DB balances; a DRAFT-only selection shows 0.00) — in `backend/test/integration/invoicing-browse.spec.ts`.
- [X] T055 [P] [US4] Integration test — invoice detail: lines with SKU/name, totals, `paymentsApplied` including reversed entries, `balance`, `isOverdue`, void info when void, `version`; read-only once ISSUED; another organization's invoice → 404 — in `backend/test/integration/invoicing-browse.spec.ts`.
- [X] T056 [P] [US4] Integration test — open invoices: `GET /invoices/open?customerId=` returns the customer's ISSUED or PARTIALLY_PAID invoices with balance > 0 and their balances; unknown/other-organization customer → 404; requires `invoices.read` — in `backend/test/integration/invoicing-browse.spec.ts`.
- [X] T057 [P] [US4] Integration test — payment list: search by number or customer; date range end before start → 400 `VALIDATION_ERROR` naming the date field, both ends inclusive; derived status filter (Active=RECORDED / Reversed=REVERSED / All, default All) combines with the independent method filter; filter, rows and total come from one left join to `payment_reversals` so the total matches the filtered rows across several pages with mixed reversed and active payments; each row carries its computed status and reversed rows read "Reversed on \<date\>"; default sort `paymentDate desc` — in `backend/test/integration/payments-browse.spec.ts`.
- [X] T058 [P] [US4] Integration test — payment detail: fields plus computed status; allocations with invoice number, amount and `reversed` flag; the reversal block (reason, date, by) when present and null otherwise; another organization's payment → 404; requires `payments.read` — in `backend/test/integration/payments-browse.spec.ts`.
- [X] T059 [P] [US4] Integration test — tenant isolation and permissions across the list/detail endpoints: another organization's record → 404; reads need `invoices.read`/`payments.read`; every endpoint declares the module gate — in `backend/test/integration/invoicing-isolation.spec.ts`.

### Implementation for User Story 4 (depends on T054–T059 failing)

- [X] T060 [US4] Implement the read side in `backend/src/modules/invoicing/invoicing.service.ts`: rows, `total`, `outstanding` and `overdue` computed in one snapshot via the `invoice_balances` view; the payments list computed from one query with a left join to `payment_reversals`; server-computed decimal strings; stable tie-breaks — research D-002, D-003, D-020.
- [X] T061 [US4] Define the list DTOs (search, status, overdue, sort allow-list validation, page/pageSize cap) and the payments list DTO (status/method filters, inclusive date range validated end ≥ start) plus response DTOs in `backend/src/modules/invoicing/dto/list-invoices.dto.ts` and `dto/list-payments.dto.ts`.
- [X] T062 [US4] Expose `GET /invoices`, `GET /invoices/open`, `GET /invoices/:id`, `GET /payments`, `GET /payments/:id` with their permissions, the module gate and OpenAPI annotations in `backend/src/modules/invoicing/invoicing.controller.ts`.
- [X] T063 [US4] Re-run the US4 integration tests green (`backend/test/integration/invoicing-browse.spec.ts`, `payments-browse.spec.ts`).

**Checkpoint**: documents are findable; the figures always describe the selection on screen.

---

## Phase 7: User Story 5 — The Invoicing screens show real data (Priority: P1)

**Goal**: the invoice list with its selection figures, create dialog, invoice detail with Print, Record payment screen, Payments list and detail, and the dialogs' idempotency-key lifecycle all run on the real backend; the sample banner and sample invoicing data are gone; the sales order detail's "Create Invoice" is enabled for SHIPPED orders.

**Independent Test**: sign in to an organization with a shipped order; create, issue, void, re-create an invoice; record and reverse a payment; print the invoice; confirm no sample-data banner appears anywhere in Invoicing and the sales order detail links to its invoice.

### Tests for User Story 5 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X]  [P] [US5] Component test — no SampleDataBanner renders on any Invoicing screen and every invoicing datum comes from the real API client — in `frontend/src/features/invoicing/__tests__/invoicing-page.spec.tsx`.
- [X]  [P] [US5] Component test — the invoice list renders the server-computed "Outstanding in this selection" and "Overdue in this selection" figures (0.00 for an empty selection, the filters stated when active) and the create dialog lists only shipped orders without a non-void invoice — in `frontend/src/features/invoicing/__tests__/invoicing-page.spec.tsx`.
- [X]  [P] [US5] Component test — the Issue, Void, Record-payment and Reverse dialogs generate an idempotency key on open and reuse it on every retry; after a definite answer a new key is generated on reopen; after an unknown outcome the key is reused (double click acts once) — in `frontend/src/features/invoicing/__tests__/dialogs.spec.tsx`.
- [X]  [P] [US5] Component test — allocation errors, `BALANCE_CHANGED` and usage refusals show inline with the request identifier; an over-allocation names the invoice and its balance; the Record-payment screen requires both `payments.record` and `invoices.read` while a direct call is still refused by the server — in `frontend/src/features/invoicing/__tests__/payment-form.spec.tsx`.
- [X]  [P] [US5] Component test — reversed payments are marked "Reversed on \<date\>" as text as well as colour; the status and method filters combine; actions the member lacks are hidden/disabled from `GET /auth/me` — in `frontend/src/features/invoicing/__tests__/payments-page.spec.tsx`.
- [X]  [P] [US5] Component test — the sales order detail shows "Create Invoice" enabled for a SHIPPED order (disabled with "Arrives with Invoicing" only until this feature is live) and linking to its invoice; the Print view renders only the invoice and the label — in `frontend/src/features/sales/__tests__/order-detail.spec.tsx` and `frontend/src/features/invoicing/__tests__/invoice-print.spec.tsx`.

### Implementation for User Story 5 (depends on T064–T069 failing)

- [X]  [US5] Wire the invoice list (search, status filter, overdue filter, sort, page, the selection figures, filters note) to the real client — in `frontend/src/features/invoicing/invoicing-page.tsx`.
- [X]  [US5] Wire the create dialog to `listInvoicableOrders` + `POST /sales-orders/:id/invoices`; on success navigate to the draft's detail — in `frontend/src/features/invoicing/invoicing-page.tsx`.
- [X]  [US5] Wire the invoice detail (lines, totals, payments applied with reversal state, void info, `version`) and the Print button with the print stylesheet showing only the invoice and the "Operational invoice - not a tax invoice" label — in `frontend/src/features/invoicing/invoice-detail-page.tsx`.
- [X]  [US5] Wire the Issue and Void dialogs with the idempotency-key lifecycle and inline errors in `invoice-detail-page.tsx`.
- [X]  [US5] Wire the Record payment screen to `listOpenInvoicesForCustomer` and `POST /payments`, carrying each invoice's displayed balance as `expectedBalance`, enforcing the exact-sum rule in the form and handling `BALANCE_CHANGED`/`OVER_ALLOCATION` inline — in `frontend/src/features/invoicing/payment-form-page.tsx`.
- [X]  [US5] Wire the Payments list (search, date range, derived status and independent method filters, server total) and the payment detail (allocations with invoice number, amount, reversal state; the reversal block) — in `frontend/src/features/invoicing/invoicing-page.tsx` and `frontend/src/features/invoicing/payment-detail-page.tsx`.
- [X]  [US5] Enable "Create Invoice" for SHIPPED orders on the sales order detail, linking to the invoice when one exists — in `frontend/src/features/sales/order-detail-page.tsx` (FR-033).
- [X]  [US5] Update the EN and AR locale labels for the new figures, filters, statuses and dialogs, preserving UTF-8/LF, no `*` characters in labels — in `frontend/src/i18n/locales/en/invoicing.ts` and `frontend/src/i18n/locales/ar/invoicing.ts`.
- [X]  [US5] Re-run the US5 component tests green (`frontend/src/features/invoicing/__tests__/`, `frontend/src/features/sales/__tests__/order-detail.spec.tsx`).

**Checkpoint**: every Invoicing surface reads and writes real data; nothing sample remains.

---

## Phase 8: User Story 6 — Protect customers referenced by open invoices (Priority: P1)

**Goal**: archiving a customer named on a DRAFT, ISSUED or PARTIALLY_PAID invoice is refused with 409 `CONTACT_IN_USE` naming the blocking invoice; PAID and VOID invoices never block.

**Independent Test**: issue an invoice to a customer; archive that customer — refused with `CONTACT_IN_USE` naming the invoice; pay or void it and archive again — allowed.

### Tests for User Story 6 (MANDATORY - write first, observe failure) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X]  [P] [US6] Integration test — archiving a customer on a DRAFT, ISSUED or PARTIALLY_PAID invoice is refused with 409 `CONTACT_IN_USE` naming the blocking invoice; the customer remains active; a customer referenced only by PAID/VOID invoices archives normally — in `backend/test/integration/invoicing-usage.spec.ts`.

### Implementation for User Story 6 (depends on T079 failing)

- [X]  [US6] Add the invoice-usage answer to Contacts: refusing `contacts/archive` when an open (DRAFT/ISSUED/PARTIALLY_PAID) invoice names the customer, returning 409 `CONTACT_IN_USE` with the blocking invoice — in `backend/src/modules/invoicing/invoicing-usage.service.ts` (Invoicing-owned), called from `backend/src/modules/contacts/contacts.service.ts` (FR-031; research D-001/VI).
- [X]  [US6] Re-run the US6 integration tests green (`backend/test/integration/invoicing-usage.spec.ts`).

**Checkpoint**: an open invoice never points at an archived customer.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: improvements and verifications that affect multiple user stories.

- [X]  [P] Regenerate the OpenAPI contract from the implemented invoicing/payments endpoints and run the contract-drift check (`npm run openapi:diff --workspace @nexuserp/api`); canonical contract recorded in `specs/013-invoicing-payments/contracts/invoicing-api.md` (FR-039).
- [X]  [P] Extend `scripts/verify-db-invariants.mjs` with the invoice/payment invariants 10–19 from data-model.md (total = Σ line totals = order total; paid + balance = total; balance ≥ 0; status agrees with balance; issued invoices carry number/issue date/due date; one non-void invoice per order; payment allocations sum to the payment amount; append-only tables refuse UPDATE/DELETE/TRUNCATE with no API-role grants; issued invoices reject header/line changes; unfiltered outstanding/overdue figures equal the DB balances) — run it green against both schemas (FR-040, SC-010).
- [X] T084 [P] Validate `specs/013-invoicing-payments/quickstart.md` end-to-end: dev API on :3000, frontend on :5173, health check via the proxy, create/issue/void/re-create an invoice, record/reverse a payment, print the invoice, verify the archive guard and that the public schema's row counts are unchanged.
- [X] T085 [P] Accessibility and UX-rule review of the Invoicing screens in `frontend/src/features/invoicing/` against PRD 7.3 and WCAG 2.1 AA (labeled fields, focus, keyboard, inline errors, request-identifier errors, named toasts, status badges, skeletons, disabled submits).
- [X] T086 [P] Tenant-isolation sweep across every invoicing and payments endpoint in `backend/src/modules/invoicing/invoicing.controller.ts` (Principle I; SC-007).
- [X] T087 [P] Concurrency, rollback and idempotency regression run against real PostgreSQL — grouped suites in `backend/test/integration/`, isolated `nexuserp_test` schema, `connection_limit=5` (Principle III; SC-003/004/005).
- [ ] T088 Verify critical-path coverage is at least 80% in the CI report produced by `.github/workflows/ci.yml` (Principle V; FR-041).
- [ ] T089 Code cleanup and refactoring across `backend/src/modules/invoicing/` and `frontend/src/features/invoicing/`.

**Checkpoint**: every guard passes and the feature is release-ready.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3–8)**: All depend on Foundational phase completion.
  - US1 has no dependencies on other stories.
  - US2 builds on US1 (payments allocate against issued invoices).
  - US3 builds on US2 (reversal repairs a recorded payment).
  - US4 reads US1–US3 documents (no writes).
  - US5 consumes every backend surface through the UI.
  - US6 builds on US1 (the guard reads open invoices).
- **Polish (Phase 9)**: Depends on all user stories being complete.

### User Story Completion Order (recommended)

1. **US1** (create, issue, void) — MVP; nothing can be paid without an issued invoice.
2. **US2** (record payment) — extends US1's invoices with allocations.
3. **US3** (reverse payment) — repairs US2's postings.
4. **US4** (browse) — reads invoices and payments.
5. **US5** (real screens) — consumes every backend surface through the UI.
6. **US6** (protect customers) — the usage guard reads open invoices.

Within each user story: tests first (write and observe failure), then services, then endpoints, then re-run green; story complete before moving to the next priority.

### Parallel Opportunities

- All Setup tasks marked [P] in Phase 1 can run in parallel.
- All Foundational tasks marked [P] in Phase 2 can run in parallel (within Phase 2).
- Once Foundational completes, all user stories can start in parallel (if staffed).
- All tests for a user story marked [P] can run in parallel.
- Different user stories can be worked on in parallel by different team members.

### Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (tests are mandatory):
Task: "Integration test — create from a SHIPPED order saves a DRAFT ... in backend/test/integration/invoicing-create.spec.ts"
Task: "Integration test — create refusals and permissions ... in backend/test/integration/invoicing-create.spec.ts"
Task: "Integration test — issue allocates the INV- number ... in backend/test/integration/invoicing-issue.spec.ts"
Task: "Integration test — immutability with direct SQL ... in backend/test/integration/invoicing-immutability.spec.ts"

# Then the implementation (sequential, one service file):
Task: "Implement the invoice writes in backend/src/modules/invoicing/invoicing.service.ts"
Task: "Define the request/response DTOs in backend/src/modules/invoicing/dto/*.ts"
Task: "Expose the endpoints in backend/src/modules/invoicing/invoicing.controller.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: test User Story 1 independently (create/issue/void from a shipped order).
5. Deploy/demo if ready.

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready.
2. Add User Story 1 → test independently → deploy/demo (MVP!).
3. Add User Story 2 → test independently → deploy/demo.
4. Add User Story 3 → test independently → deploy/demo.
5. Add User Story 4 → test independently → deploy/demo.
6. Add User Story 5 → test independently → deploy/demo.
7. Add User Story 6 → test independently → deploy/demo.
8. Polish (Phase 9) → release checks.
9. Each story adds value without breaking previous stories.

### Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps task to a specific user story for traceability (US1–US6).
- Each user story should be independently completable and testable.
- Verify tests fail before implementing.
- Commit after each task or logical group (only on explicit instruction).
- Stop at any checkpoint to validate the story independently.
- Integration tests: run grouped per suite against the isolated `nexuserp_test` schema with `connection_limit=5`; never run suites concurrently (pooler caps at 15 session connections).
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.

