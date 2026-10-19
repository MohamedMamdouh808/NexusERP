# Database Conventions

This document describes the database conventions established for NexusERP.

## Schema Conventions

### Tenant Scoping Convention

- Every organization-owned table carries `organization_id`, NOT NULL, indexed.
- Every foreign key **between** organization-owned tables is composite over `(organization_id, id)`, not over `id` alone. A single-column foreign key would permit a row to reference a parent in another organization; the composite key makes that structurally impossible.
- The first such table will be created by the organization feature. This feature contributes the naming, the index, and the composite-key rule, plus the rule that a repository query without a resolved tenant context fails rather than reading unscoped.

### Exact Decimal Convention

| Kind | Column type | Example columns |
|---|---|---|
| Money | `NUMERIC(14,2)` | line totals, document totals, balances, paid amounts |
| Unit price and unit cost | `NUMERIC(14,4)` | `unit_price`, `unit_cost`, `purchase_price`, `selling_price` |
| Quantity | `NUMERIC(14,3)` | ordered, received, reserved, on-hand, shipped |

- Prisma models these as `Decimal`. Values cross the API boundary as **strings**. A JavaScript number never holds a monetary or quantity value at any point, in application code or in tests.
- Money and quantity columns carry a NOT NULL check constraint; quantities that are signed by nature (movement deltas, adjustment quantities) are exempt from the non-negative check and are instead constrained by the movement type that produced them.

### Immutability and Append-Only Convention

- Posted tables (`stock_movements`, `audit_logs`, shipments, issued invoices, payments, allocations) are created append-only. The application database role is granted INSERT and SELECT only; UPDATE and DELETE are revoked at the database level, not merely omitted from the ORM. A logged `UPDATE` or `DELETE` on a posted row is a failed transaction.
- The revoke is expressed in a migration, so it is version-controlled and applied everywhere the schema is applied, rather than being a manual production step someone can forget.

### Transaction Boundary Convention

- Every multi-record operation runs inside one transaction obtained from the unit of work (see [research.md R-003](research.md)).
- The idempotency key record and the business change commit in the same transaction.
- The audit record commits in the same transaction; a failed audit insert rolls back the business change.

### Ordering and Numbering Convention

- Document numbers are assigned from a per-organization sequence row locked inside the creating transaction. The `NumberSequence` table belongs to the organization feature and is not created here.
- The number format is fixed and shared with the design system: `PO-`, `GR-`, `SO-`, `SH-`, `INV-`, `PAY-` followed by six digits, rendered in the design system's monospace face.

### Timestamp Convention

- All timestamps are stored as `timestamp with time zone` in UTC. Local time is a presentation concern applied at the edge. This keeps log records, migration history, and audit records comparable across machines and timezones.