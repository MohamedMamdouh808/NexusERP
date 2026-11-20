# Research: Reports Analytics Page End to End

## R-001 — Shared definitions location

- **Decision**: Sales/purchases/payments definitions live in a shared server service `ReportsDefinitionsService` (imports: Invoicing for the shared balance/overdue definition, Inventory for low-stock definition) used by every report, list and later the dashboard. No view reimplementation.
- **Rationale**: Spec mandates definitions stated once, used everywhere.
- **Alternatives considered**: DB views for each definition (rejected — harder to parametrize by org and date range; versioned code is preferable).

## R-002 — Granularity selection

- **Decision**: Server chooses granularity from range length in UTC days: ≤31 days → day; ≤120 days → week; else month. Buckets zero-filled between range boundaries inclusive.
- **Rationale**: Spec requirement; avoids buckets explosion.
- **Alternatives considered**: client-chosen granularity (rejected — spec puts the choice on the server).

## R-003 — Bucket zero-filling

- **Decision**: Generate the full bucket sequence, left join invoice/payment/movement facts; bucket with no facts returns total 0 and count 0.
- **Rationale**: Spec requires zero-filled buckets present.

## R-004 — Previous-period arithmetic

- **Decision**: Server computes previous-period figure (same length immediately preceding) and the change; change is `null` when previous is zero. Interface renders arrows and "increase/decrease" from sign of change; good/bad direction per KPI defined server-side in contract (overdue balance falling = good; payments rising = good; low stock rising = bad, etc.).
- **Rationale**: Interface never does arithmetic on money.

## R-005 — Aging equality with Invoicing list

- **Decision**: Reuse `invoice_balances` view + same predicate; same bucket math; same filtered selection semantics.
- **Rationale**: Spec requires exact equality.

## R-006 — Low/out/in stock definition

- **Decision**: Reuse the Inventory screens' product-level definition (archived products excluded): available = on hand − reserved; in-stock = available > threshold; low-stock = 0 < available ≤ threshold; out-of-stock = available ≤ 0.
- **Rationale**: Spec mandates exact equality with Inventory screens.

## R-007 — Chart library

- **Decision**: Use the chart library already in the package (e.g., `recharts` — already present). No new dependencies.
- **Rationale**: Spec forbids new dependencies.

## R-008 — Indexes

- **Decision**: Add `payments(organization_id, payment_date)`, `purchase_orders(organization_id, order_date)`, `invoices(organization_id, issue_date)`, and reuse existing movement indexes; in a new migration.
- **Rationale**: Spec limits to indexes the queries need.

## R-009 — Performance test

- **Decision**: Generate ≥2,000 products, 20,000 movements, 5,000 invoices, 5,000 sales orders, 2,000 POs, 5,000 payments in isolated schema; measure each endpoint p95; record measured results; claim nothing without a measurement.
- **Rationale**: Spec requires honest reporting.