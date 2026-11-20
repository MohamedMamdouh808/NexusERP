# Research: Sales end to end — sales orders, reservations, and shipments

**Feature**: P0-F008/P0-F009 | **Branch**: `012-sales-end-to-end` | **Date**: 2026-11-14

## Context

Build the backend API and switch the Sales screens from sample data to the real backend. Pattern follows Contacts/Products/Inventory/Purchasing: snake_case naming, composite organization keys `(organization_id, id)`, versions, audit entries, idempotency keys, module-gate hook, RLS with no policies, additive-only immutable migrations.

## Decisions

### D-001: Shipments read permission → `sales.read`
**Decision**: `GET /shipments` and `GET /shipments/:id` require `sales.read`; `POST /sales-orders/:id/shipments` requires `inventory.ship`.
**Rationale**: The feature description names exactly three permissions (`sales.read`, `sales.write`, `inventory.ship`). Shipments are sales documents, matching the Purchasing precedent where the goods-receipts list uses `purchasing.read`. PRD 9.5 table rows and revision history (v1.1) were updated accordingly; Fr-021 documents the deviation with a one-line reason.
**Alternatives considered**: `inventory.read` (literal PRD 9.5) — rejected because it diverges from the feature description and the Purchasing precedent, and would let inventory-only roles read shipment documents they cannot see orders for.

### D-002: Document numbering SO-/SH-
**Decision**: Six-digit numbers, same first-use per-organization advisory-lock allocation as purchase orders (`PO-`/`GR-`). `SO-` for sales orders, `SH-` for shipments; each document type has its own `document_sequences` row with unique constraint `(organization_id, name)`; unique index `(organization_id, number)` on sales-order and shipment numbers.
**Rationale**: Matches the user requirement ("same digits and same sequence allocation as the purchase order numbers") and the Purchasing first-use advisory-lock pattern.
**Alternatives considered**: Different widths per document type — rejected; user specified the same digits as purchase orders.

### D-003: Ship does not carry the version
**Decision**: `POST /sales-orders/:id/shipments` does not present an order version. Concurrency safety comes from the order lock, the CONFIRMED status check, and the per-line active-reservation guard inside the transaction.
**Rationale**: Mirrors the goods-receipt precedent (receipt requests do not carry the purchase-order version). Version governs header edits and confirm/cancel.
**Alternatives considered**: Versioned ship like update/confirm — rejected; Purchasing precedent shows receipts rely on locks instead, simpler for a whole-order ship.

### D-004: One shipment ships the whole order
**Decision**: `POST /sales-orders/:id/shipments` creates one shipment for all lines of the order; no partial quantities. Schema supports multiple shipments per order for P1, but this feature posts one shipment.
**Rationale**: Matches the user requirement ("in this feature one shipment ships the whole order") and P0-F009.
**Alternatives considered**: Partial shipment/backorder — rejected; out of scope (P1-F004).

### D-005: Cross-module stock writes via Inventory service
**Decision**: Sales never writes `stock_movements`, `stock_balances`, or `stock_reservations` directly. It calls the Inventory module's service inside the confirm/ship transaction for reservations and SHIPMENT movements.
**Rationale**: Constitution Principle VI — a module never writes another module's tables; cross-module workflows call the owning module's service in one transaction.
**Alternatives considered**: Direct table writes by Sales — rejected; violates Principle VI.

### D-006: Cancel releases reservations
**Decision**: Cancelling a CONFIRMED order marks its ACTIVE reservations RELEASED and decreases reserved; cancelling DRAFT simply moves to CANCELLED; cancelling SHIPPED returns 409 `ORDER_SHIPPED`.
**Rationale**: Matches P0-F008 user story alternate flow A3 and the user's Backend item 6.
**Alternatives considered**: Disallow cancelling CONFIRMED orders — rejected; the spec explicitly allows it with reservation release.

### D-007: Available-quantity advice is non-blocking
**Decision**: The order form shows real available quantity (on hand − reserved) beside each line as advice only; a quantity above it shows a warning but the draft can still be saved; the server decides availability at confirm.
**Rationale**: Matches Interface item 11 ("advice only … quantity above it shows a warning but the draft can still be saved").
**Alternatives considered**: Blocking save above available — rejected; would prevent saving drafts the user wants to keep.

### D-008: Idempotency key lifecycle in dialogs
**Decision**: Confirm/Ship/Cancel dialogs generate the idempotency key when opened and reuse it on retry of the same attempt; after a definite success/failure, reopening generates a new key; after an unknown outcome (timeout), reopening reuses the same key.
**Rationale**: Matches Interface item 11 ("a double click acts once"); Purchasing receive dialog precedent.
**Alternatives considered**: Always new key on reopen — rejected; risks duplicate posting after timeouts.

### D-009: Migration strategy
**Decision**: New tables, constraints, indexes, triggers, privileges, RLS in additive-only migrations; existing migrations never edited.
**Rationale**: Matches the immutable-migrations requirement and Purchasing precedent (FR-034 equivalent).
**Alternatives considered**: Editing existing migrations — rejected; violates immutability.

### D-010: RLS enabled with no policies
**Decision**: Every new table enables RLS with no policies, following the existing tenant-isolation pattern.
**Rationale**: Matches the RLS-with-no-policies requirement; enforcement is in application queries scoped by session tenant context.
**Alternatives considered**: RLS with policies — rejected; the project pattern is RLS enabled/no policies with application-layer tenant scoping.

## Open items (none)
All clarification markers resolved in `specs/012-sales-end-to-end/spec.md` Clarifications session. No NEEDS CLARIFICATION remain.
