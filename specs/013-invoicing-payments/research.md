# Research: Invoicing and Payments end to end

**Feature**: P0-F010/P0-F011 | **Branch**: `013-invoicing-payments` | **Date**: 2026-11-14

## Context

Build the backend API and switch the Invoicing screens from sample data to the real backend. Pattern follows Contacts/Products/Inventory/Purchasing/Sales: snake_case naming, composite organization keys `(organization_id, id)`, versions, audit entries, idempotency keys, module-gate hook, RLS with no policies, additive-only immutable migrations. The frontend already carries the Invoicing screens wired through a service seam; the seam swap is part of this feature.

## Decisions

### D-001: Create-invoice permission → `invoices.write` alone
**Decision**: `POST /sales-orders/:id/invoices` requires `invoices.write` only. No sales permission is required; the order is read through the Sales service inside the create transaction. An other-organization order returns 404 (never 403); a non-SHIPPED order returns 409 INVALID_STATE_TRANSITION; an order that already has a non-void invoice returns 409 INVOICE_ALREADY_EXISTS (new code).
**Rationale**: The owner's clarification (Session 2026-11-14, Q1): PRD 9.5 is authoritative; the feature description's "sales and invoices.write" does not add a permission. A member with `invoices.write` but not `sales.read` can invoice; a member with `sales.write` but not `invoices.write` gets 403.
**Alternatives considered**: `sales.read` + `invoices.write` — rejected by the owner; `sales.write` + `invoices.write` — rejected by the owner.

### D-002: Outstanding and overdue figures = the whole filtered selection
**Decision**: The invoice list returns `outstanding` and `overdue` covering exactly the selection matching the current search/status/overdue filters, across all pages, independent of page/pageSize. Outstanding = sum of balances of ISSUED and PARTIALLY_PAID invoices in the selection; overdue = the part of that sum belonging to invoices due before today (UTC) with balance > 0. One shared definition — a database view (`invoice_balances`, see data-model.md) or a single service function — is reused by the list, the later Outstanding Invoices report, and the Dashboard. Rows, total, and figures are computed from one snapshot. Figures travel as decimal strings with two places; the interface labels them "Outstanding in this selection" and "Overdue in this selection", shows them even for an empty selection (0.00), and states the filters they reflect. No organization-wide card ships with this screen; the Dashboard owns it. The unfiltered figures must equal the invoices' balances in the database — added to `scripts/verify-db-invariants.mjs`.
**Rationale**: The owner's clarification (Session 2026-11-14, Q2); consistent with the list `total` semantics; prevents two contradictory sources of truth for "how much is owed".
**Alternatives considered**: Organization-wide open-book figures regardless of filter — rejected by the owner (would confuse the filtered totals); both — rejected as redundant.

### D-003: Payments status filter = derived reversal state
**Decision**: The payments list has a status filter with values Active (RECORDED), Reversed (REVERSED), All (default All), derived from the existence of a `payment_reversals` row. The API exposes `status` as a computed field on each row and in the detail (`RECORDED` when no reversal, `REVERSED` otherwise). Filter, rows, and total come from one query with a left join to `payment_reversals` — the total always matches the filtered rows, and a test proves it with a mix of reversed and active payments across several pages. An independent `method` filter (Cash, Bank transfer, Card, Other, All) is added. Reversed payments show the reversal's date and reason in the detail; the list marks them "Reversed on <date>" as text as well as colour. A payment's allocations remain visible after reversal, labelled as reversed; invoice balances count only allocations of payments without a reversal. `payment_reversals` is indexed on `payment_id`.
**Rationale**: The owner's clarification (Session 2026-11-14, Q3); payments stay append-only with no status column; one query keeps the total honest.
**Alternatives considered**: A stored status column — rejected (violates append-only, duplicates derivable truth); no status filter — rejected (the description requires one); method filter only — rejected (status is the requirement).

### D-004: Due-date resolution at issue
**Decision**: At issue, the due date resolves in order: (1) a due date supplied on the request, which must not precede the issue date; (2) the draft's due date, kept when the request supplies none, which also must not precede the issue date (else 400 VALIDATION_ERROR naming the due date); (3) the default: issue date plus `default_payment_terms_days`. A draft's due date may never precede the invoice's creation date.
**Rationale**: The owner's clarification (Session 2026-11-14, Q, due dates); makes the draft's editable due date meaningful and matches PRD flow step 3 ("Omar may change the due date").
**Alternatives considered**: Issue always recomputes (draft's due date discarded) — rejected by the owner; issue never supplies one — rejected by the owner.

### D-005: PRD 9.7 lists `invoice.shipment_id`; the feature description omits it
**Decision**: `invoices` carries `sales_order_id` only — no `shipment_id` column. The invoice derives from the order; the order is SHIPPED and the one shipment is implicit. PRD 9.7 and data-model continuity are accepted as a recorded deviation.
**Rationale**: The user's feature description (authoritative for this feature) lists the invoice's fields without `shipment_id`; one shipment per order makes it redundant in v1; P1 partial invoicing would introduce it deliberately.
**Alternatives considered**: Adding a nullable `shipment_id` now — rejected; YAGNI, and it invites ambiguity about which shipment backs the draft.

### D-006: `BALANCE_CHANGED` vs `OVER_ALLOCATION`
**Decision**: Every allocation in `POST /payments` carries the balance the client read (`expectedBalance`). Under the invoice locks (ascending id), the server recomputes balances; a recomputed balance different from the client-read one returns 409 `BALANCE_CHANGED` with `details: { invoiceId, currentBalance }`. When the recomputed balance matches the client-read one but the allocation exceeds it, 400 `OVER_ALLOCATION` (allocation names the invoice). Allocations not summing exactly to the payment amount return 400 `VALIDATION_ERROR`. Allocating to a DRAFT/VOID/PAID invoice, or another customer's/organization's invoice, returns 409. Allocation above balance may never be written, under either code.
**Rationale**: Matches the description's stale-read rule and PRD's OVER_ALLOCATION code; the two codes let the interface distinguish "the world changed" from "you asked for too much".
**Alternatives considered**: A single 400 for all allocation problems — rejected; the description requires BALANCE_CHANGED with the current balance.

### D-007: Document numbering `INV-` / `PAY-`
**Decision**: Six-digit numbers allocated from the organization's document sequences inside the creating/issuing transaction under `pg_advisory_xact_lock(hashtext('<orgId>:<name>'))`, exactly like `SO-`/`SH-` (`sales-number.ts`). New sequence kinds `invoice` and `payment`; invoice numbers are allocated at issue, payment numbers at creation. A rolled-back write returns the number instead of leaving a gap.
**Rationale**: Same digits and same allocation as the other documents; the user's requirement and the Purchasing/Sales precedent.
**Alternatives considered**: A shared single sequence for all documents — rejected; each document kind already has its own row by design.

### D-008: Payment concurrency control
**Decision**: `POST /payments` locks the target invoices in ascending `id` order, recomputes each balance under the lock (sum of allocations of payments with no reversal), and compares to the client-read expected balances. Two simultaneous payments against the same invoice cannot over-allocate it; the loser is refused 409 BALANCE_CHANGED. A payment racing a void yields exactly one consistent outcome (either the payment finds no ISSUED invoice, or the void is refused 409 INVOICE_HAS_PAYMENTS). A reversal racing a new payment yields one consistent final state.
**Rationale**: Matches the description's ascending-id lock rule and the confirm/ship precedent; prevents both deadlocks and over-allocation.
**Alternatives considered**: Version-checked payments — rejected (payments are append-only and per-invoice locking is sufficient); advisory-lock-per-invoice without ORDER BY — rejected (deadlock risk).

### D-009: One non-void invoice per sales order
**Decision**: A partial unique index on `(organization_id, sales_order_id) WHERE status <> 'VOID'` enforces it at the database; the service checks for a non-void invoice before insert as a friendly guard. A VOID invoice never blocks re-invoicing.
**Rationale**: Matches the description; the index makes the rule impossible to bypass through any path.
**Alternatives considered**: Application-only check — rejected; two racing creates could both insert.

### D-010: Append-only and immutability come from the stated migration steps
**Decision**: One migration step installs the payments/allocations/reversals append-only enforcement (BEFORE UPDATE/DELETE triggers raising, TRUNCATE revoked from PUBLIC and the Supabase application roles `service_role`/`authenticated`/`anon`) — mirroring migrations `20261114000004..000007` but in a single step as required. Invoice lines are insert-only: a trigger rejects UPDATE/DELETE/TRUNCATE regardless of invoice status (no sanctioned line mutation exists in this feature); the parent invoice's header trigger rejects changes to customer/order/number/issue_date/total once the invoice is not DRAFT, and restricts changes to status and void fields through the allowed transition map (FR-015). The issued-invoice trigger and the append-only trio arrive in additive migrations; existing migrations are never edited.
**Rationale**: The description: "the full set of triggers and revokes comes from one migration step"; the append-only template is proven in this repository.
**Alternatives considered**: App-only enforcement — rejected (the description demands database enforcement for immutability and append-only).

### D-011: Idempotency scope
**Decision**: `POST /invoices/:id/issue`, `POST /invoices/:id/void`, `POST /payments`, and `POST /payments/:id/reverse` require the `Idempotency-Key` header; the key record, request fingerprint, response, and expiry commit in the same transaction. Create (`POST /sales-orders/:id/invoices`) and the draft update (`PUT /invoices/:id`) do NOT require one (PRD 9.5); the draft update is guarded by DRAFT-only and the version check.
**Rationale**: Matches the description exactly and the PRD 9.5 idempotency column; nothing is stored for a failed transaction.
**Alternatives considered**: Idempotency on every endpoint — rejected (creates and due-date edits are safely re-validated server-side).

### D-012: Open-invoices read for the record-payment screen
**Decision**: `GET /invoices/open?customerId=<uuid>` returns the customer's ISSUED or PARTIALLY_PAID invoices with balance > 0, guarded by `invoices.read`. The record-payment screen therefore requires both `payments.record` and `invoices.read` (the allocation table and the Record button hide otherwise; a direct call still fails closed).
**Rationale**: The data is invoice data and PRD grants `invoices.read` as its read permission; default Manager/Administrator roles hold both; the Sales default role holds `invoices.read` but not `payments.record` — honest permission layering.
**Alternatives considered**: `payments.read` for the endpoint — rejected; it would double-grant invoice visibility to payments-only members through a backdoor nobody audited; `payments.record` — rejected for the same reason.

### D-013: Shared vocabulary additions
**Decision**: Audit actions added: `invoices.created`, `invoices.updated`, `invoices.issued`, `invoices.voided`, `payments.recorded`, `payments.reversed`. Error codes added to `shared/src/errors`: `BALANCE_CHANGED` (409), `INVOICE_ALREADY_EXISTS` (409) — `INVOICE_HAS_PAYMENTS` and `OVER_ALLOCATION` already exist. Both new codes land in `EMITTABLE_ERROR_CODES` only with the endpoint and test that emits them.
**Rationale**: The description requires the codes and the audit trail; the catalog rules in `shared/src/errors/index.ts` require codes to be added with their emitters.
**Alternatives considered**: Reusing `CONFLICT`/`DUPLICATE_RECORD` — rejected; the description names `INVOICE_HAS_PAYMENTS`/`BALANCE_CHANGED` explicitly, and the catalog forbids reuse for different failures.

### D-014: Draft update endpoint
**Decision**: `PUT /invoices/:id` with body `{ dueDate, version }` only; DRAFT invoices only; 409 INVALID_STATE_TRANSITION otherwise; 409 STALE_VERSION on a stale version; increments version with its audit entry. Not idempotent (PRD 9.5).
**Rationale**: The description: "Drafts can change only their due date"; PRD 9.5's path and non-idempotent marking.
**Alternatives considered**: `PATCH /invoices/:id` — rejected; PRD 9.5 names PUT.

### D-015: `organizations.default_payment_terms_days`
**Decision**: New column `default_payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (0 BETWEEN 0 AND 365)` on `organizations` in a new migration; exposed read-only on `GET /organizations/current` alongside `currencyCode`; no editing UI until the Organization settings feature.
**Rationale**: The description; mirrors how `currency_code` is exposed.
**Alternatives considered**: A dedicated invoicing settings table — rejected; the description places it on the organization.

### D-016: Overdue is derived, never stored
**Decision**: Overdue = `due_date < (now() AT TIME ZONE 'UTC')::date AND balance > 0`, computed at read time in the shared view; no column.
**Rationale**: The description; a stored flag would need maintenance after every payment and reversal.
**Alternatives considered**: Stored `is_overdue` — rejected; permanent risk of drift.

### D-017: Void rules
**Decision**: `POST /invoices/:id/void` requires `invoices.void`, `Idempotency-Key`, and a non-empty `reason`. Allowed from DRAFT (no active allocations exist by construction there) and from ISSUED with zero active allocations (allocations of unreversed payments). PARTIALLY_PAID and PAID always refused 409 INVOICE_HAS_PAYMENTS. The voided invoice remains visible in history as VOID (detail readable, lines read-only); the order may be invoiced again. `void_reason`, `voided_at`, `voided_by` stored; audit entry in the same transaction.
**Rationale**: The description and PRD A3/A4; PARTIALLY_PAID/PAID must fail loudly so payments get reversed first.
**Alternatives considered**: Allowing PARTIALLY_PAID void with allocations auto-reversed — rejected; the description refuses it.

### D-018: Print via the browser
**Decision**: Invoice detail carries a print stylesheet that hides everything except the invoice block and its "Operational invoice - not a tax invoice" label; the Print button calls `window.print()`. No PDF generation, no emailing, no server-side document rendering in this feature.
**Rationale**: The description; constitution VII; no new infrastructure.
**Alternatives considered**: Server-rendered PDF — rejected; explicitly out of scope.

### D-019: The service-seam swap
**Decision**: `use-invoicing.ts` and every Invoicing screen read through a real invoicing service module (mirror of the sales seam: `services/invoicing-client.ts` + service seam types in `catalog-service.ts` or a dedicated `services/invoicing-service.ts`). The invoicing functions are removed from `sample-catalog-service.ts`; the sample banner disappears from the invoicing screens; the Overview module keeps its private sample data with the Sales and Outstanding figures labelled sample. The sales order detail's "Create Invoice" button becomes enabled for SHIPPED orders and links to the invoice when one exists.
**Rationale**: The description (Interface 11, 12) and the 012 precedent.
**Alternatives considered**: Keeping sample data behind a feature flag — rejected; the description deletes it.

### D-020: One snapshot per list response
**Decision**: The invoice list computes rows, `total`, `outstanding`, and `overdue` inside one query/transaction so they can never disagree; the payments list computes rows, total, and computed status from one query so the total always matches the filtered rows (left join to `payment_reversals`).
**Rationale**: The description and the owner's clarifications; a figure that cannot be reproduced from the same snapshot is a bug report waiting to happen.
**Alternatives considered**: Two separate queries (rows then aggregate) — rejected; racy under concurrent payments.

## Open items (none)
All clarification markers are resolved (Clarifications session 2026-11-14 in `specs/013-invoicing-payments/spec.md`). No NEEDS CLARIFICATION remain.
