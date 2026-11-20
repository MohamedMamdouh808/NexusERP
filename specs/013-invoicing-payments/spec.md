# Feature Specification: Invoicing and Payments End to End

**Feature Branch**: `013-invoicing-payments`
**Created**: 2026-11-14
**Status**: Draft
**MoSCoW Priority**: P0 (P0-F010 Invoicing, P0-F011 Payment Recording and Allocation)
**Input**: User description: "Build Invoicing and Payments end to end: the backend API and the interface switching from sample data to the real backend. Source: docs/PRD.md P0-F010 and P0-F011, Sections 7.4, 8, 9.3, 9.6 and 9.8, the constitution, the existing Invoicing screens, and the Contacts, Products, Inventory, Purchasing and Sales features as the pattern (snake_case naming, composite organization keys, version numbers, audit entries, idempotency keys, the module-gate hook, the append-only template, RLS with no policies, migrations immutable). Document numbers INV- and PAY- use the same digits and the same sequence allocation as the other documents. These are OPERATIONAL invoices: no taxes, and every invoice is labelled "Operational invoice - not a tax invoice" in the API payload and the interface."

These are operational invoices. No tax fields exist, no tax-compliance, e-invoicing, or accounting claim is made anywhere, and every invoice - in the API payload, in the interface, and on printable output - is labelled "Operational invoice - not a tax invoice".

## Clarifications *(mandatory)*

### Session 2026-11-14

- Q: Which permission guards `POST /sales-orders/:id/invoices`?
  A: `invoices.write` alone - the PRD 9.5 row is authoritative; no PRD change is needed, and no sales permission is required on top of it. The endpoint still validates the order itself (it must exist in the caller's organization, 404 otherwise, and be SHIPPED with no non-void invoice, 409 otherwise) and reads the order through the Sales service internally, so the caller needs no sales permission to cause that read. Tests: a member holding `invoices.write` but not `sales.read` can create an invoice for a shipped order in their own organization; a member holding `sales.write` but not `invoices.write` gets 403; the order of another organization returns 404, never 403.
- Q: Do the server-computed outstanding and overdue balances in the invoice list response cover the whole filtered selection or the organization's entire open book?
  A: The whole filtered selection - the same invoices as the list's `total`: every invoice matching the current search, status, and overdue filters, across all pages, independent of page and pageSize. Outstanding is the sum of balances of ISSUED and PARTIALLY_PAID invoices in the selection; overdue is the part of that sum belonging to invoices whose due date is before today (UTC date) with a balance above zero. DRAFT, PAID, and VOID invoices contribute 0, so a DRAFT-only filter shows 0.00. Both are decimal strings in the organization's currency, computed by the server with exact decimals and never by the client. The figures, the page rows, and the total are computed from one shared definition (a single database view or service function that the invoice list, the later Outstanding Invoices report, and the Dashboard all call) and from one snapshot (one transaction or one consistent query), so they can never disagree because a payment landed between two reads. The interface labels them "Outstanding in this selection" and "Overdue in this selection", shows them even when the selection is empty (0.00), and states the filters they reflect when any filter is active. There is no organization-wide card on this screen; that arrives with the Dashboard. The unfiltered figures equal the invoices' balances in the database - add that to the invariants script.
- Q: How does a draft's due date interact with the due date set at issue? → A: Option A - issue keeps the draft's due date when the request supplies none; the issue request may override it (never before the issue date); the default (issue date plus `default_payment_terms_days`) applies only when the draft has no due date; a draft's due date must not precede the creation date.
- Q: What does the payments list "status filter" mean, given payments carry no status column?
  A: Derived reversal state with the labels Active (RECORDED), Reversed (REVERSED), All (default All), derived from the existence of a payment_reversals row; no status column is added to payments, which stay append-only. The API exposes status as a computed field on each payment row and in the detail: RECORDED when it has no reversal, REVERSED when it has one. The interface badge uses these names. The filter, the rows, and the total use the same derived rule in one query (a left join to payment_reversals, never a separate lookup per row), so the total always matches the filtered rows; a test proves it with a mix of reversed and active payments across several pages. A payment method filter (Cash, Bank transfer, Card, Other, All) is also added and is independent of the status filter. Reversed payments show the reversal's date and reason in the detail, and the list marks them "Reversed on <date>" as text as well as colour. A payment's allocated amounts to invoices keep showing after reversal, labelled as reversed, because history is never rewritten; invoice balances count only allocations of payments without a reversal. payment_reversals is indexed on its payment id so the join stays cheap. Tests: the status filter values return the right rows and the right total; a reversed payment appears under Reversed and not under Active; the method filter combines with the status filter; another organization's payments never appear.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create, issue, and void an invoice from a shipped order (Priority: P1)

As Omar, the invoicing officer, I want to create an invoice from what a shipped sales order delivered, issue it so the customer can be billed, and void it when it must be withdrawn, so that every shipment is billed exactly once and every document stays trustworthy.

**Why this priority**: The invoice is the document customers are billed with and the anchor for every payment. Without a correct create/issue/void path nothing else in this feature has meaning.

**Independent Test**: From a SHIPPED sales order, create the invoice, review its lines and total, issue it, and verify its number, issue date, and due date. Void a DRAFT invoice and verify the order can be invoiced again.

**Acceptance Scenarios**:

1. **Given** a SHIPPED sales order with no non-void invoice, **When** Omar selects Create Invoice, **Then** a DRAFT invoice is saved carrying the order's customer, lines, quantities, and unit prices, with server-calculated line totals and order total, and no number.
2. **Given** a DRAFT invoice, **When** Omar changes only its due date, **Then** the change is saved; its customer, lines, and prices cannot be changed.
3. **Given** an order that already has a non-void invoice, **When** Omar tries to create another, **Then** the request is refused with 409 and nothing is created.
4. **Given** an order that is not SHIPPED, **When** Omar tries to create an invoice, **Then** the request is refused with 409 INVALID_STATE_TRANSITION and nothing is created.
5. **Given** a DRAFT invoice, **When** Omar issues it with an Idempotency-Key, **Then** the invoice receives its INV- number from the organization sequence, the issue date, and a due date (default issue date plus the organization's default payment terms, or a supplied due date no earlier than the issue date), status ISSUED, and an audit entry commits with it.
6. **Given** an ISSUED invoice, **When** anyone tries to change its customer, order, lines, totals, number, or issue date, **Then** the database rejects the change.
7. **Given** an invoice PARTIALLY_PAID or PAID, **When** Omar tries to void it, **Then** it is refused with 409 INVOICE_HAS_PAYMENTS ("reverse the payments first").
8. **Given** an ISSUED invoice with no active allocations, **When** Omar voids it with a reason, **Then** it becomes VOID, stays in history, and its order may be invoiced again.
9. **Given** a DRAFT invoice, **When** Omar voids it with a reason, **Then** it becomes VOID and its order may be invoiced again.

---

### User Story 2 - Record a payment with allocations (Priority: P1)

As Omar, I want to record a customer payment and allocate it to one or more invoices, so that each invoice's remaining balance is always exact.

**Why this priority**: Payment recording is where money enters the system. Over-allocation or double-counting here destroys the accuracy the whole feature exists to provide.

**Independent Test**: Issue an invoice, then record a partial payment allocated to it; verify the invoice becomes PARTIALLY_PAID with balance total minus allocation; record the remainder; verify PAID at exactly zero balance.

**Acceptance Scenarios**:

1. **Given** an ISSUED invoice with a balance, **When** Omar records a payment whose allocations equal its amount and each is within the invoice balance, **Then** the payment and allocations are created, the invoice becomes PARTIALLY_PAID or PAID (PAID only at balance exactly zero), and the audit entry commits with them.
2. **Given** a payment allocation exceeding an invoice balance, **When** it is submitted, **Then** it is refused and no payment, allocation, status change, or audit entry remains.
3. **Given** allocations that do not sum exactly to the payment amount, **When** it is submitted, **Then** it is refused and nothing is created.
4. **Given** an invoice that is DRAFT, VOID, or PAID, or belongs to another customer or organization, **When** it is allocated to, **Then** the whole payment is refused and nothing is created.
5. **Given** two payments racing to allocate against the same invoice, **When** they commit, **Then** the allocations never exceed the invoice balance; the later one is refused or recomputed under the lock, and no over-allocation remains.
6. **Given** an invoice whose balance changed since Omar read it, **When** the payment is submitted, **Then** it is refused with 409 BALANCE_CHANGED naming the invoice and its current balance, and nothing is created.
7. **Given** the same idempotency key and the same body sent twice, **When** the second arrives, **Then** the stored response is returned and no second payment is created.
8. **Given** the same key with a different body, **When** posted, **Then** 422 IDEMPOTENCY_KEY_REUSED is returned and nothing changes.

---

### User Story 3 - Reverse a payment (Priority: P1)

As Omar, I want to reverse a payment that was recorded wrongly, so that invoice balances and statuses go back to their exact prior values without rewriting history.

**Why this priority**: Reversal is the only repair path for a posted payment. Without it, one mistaken posting permanently corrupts every affected invoice.

**Independent Test**: Record a payment fully paying an invoice, reverse it, and verify the payment row is unchanged, a payment_reversals record exists, and the invoice returns to ISSUED with its balance restored.

**Acceptance Scenarios**:

1. **Given** a recorded payment allocated to invoices, **When** Omar reverses it with a reason, **Then** a payment_reversals record is created (the payment row is never changed), each affected invoice's status is restored per its remaining active allocations (PAID/PARTIALLY_PAID back to ISSUED/PARTIALLY_PAID), and the audit entry commits with it.
2. **Given** a payment already reversed, **When** Omar tries to reverse it again, **Then** the request is refused with 409 and nothing changes.
3. **Given** a reversal racing a new payment against the same invoice, **When** both complete, **Then** the outcome is consistent: the reversal's balance restoration and the new payment never over-allocate or resurrect a PAID invoice incorrectly; exactly one consistent final state exists.
4. **Given** the same key with the same body sent twice, **When** the second arrives, **Then** the stored response is returned and nothing is created twice.

---

### User Story 4 - Browse invoices and payments (Priority: P1)

As Omar, I want to search, filter, sort, and page through invoices and payments, so that I can find a document, see what is outstanding and overdue, and trace what was applied where.

**Why this priority**: The lists are the daily working surface. An invoice or payment that cannot be found does not help collect what is owed.

**Independent Test**: With several invoices and payments in the organization, search by number and customer, filter by status, apply the overdue-only filter, open an invoice detail, and open the payments list with a date range. The total count reflects the whole selection, not the visible page.

**Acceptance Scenarios**:

1. **Given** several invoices, **When** Omar opens the invoice list, **Then** each row shows the number (or a marker for drafts), customer, status, issue date, due date, total, balance, and outstanding state, and the response carries a whole-selection count and the server-computed "Outstanding in this selection" and "Overdue in this selection" figures covering exactly the matching set across all pages.
2. **Given** search text, **When** Omar searches, **Then** invoices are matched by number or customer name; wildcard characters are treated literally.
3. **Given** a status filter and an overdue-only filter, **When** applied, **Then** only matching invoices are returned; overdue means due date before today (UTC) and balance above zero.
4. **Given** a page size above 100, **When** Omar asks for it, **Then** the page size is capped at 100 rather than rejected.
5. **Given** an invoice, **When** Omar opens its detail, **Then** it shows the lines, totals, payments applied (with amounts and dates), void information when void, and the balance; an ISSUED invoice's lines and totals are shown read-only.
6. **Given** several payments, **When** Omar opens the payments list, **Then** search matches number or customer name, a date range whose end precedes its start is refused with 400 VALIDATION_ERROR naming the date field, the status filter (Active, Reversed, All) and the independent method filter combine correctly, each row shows number, customer, amount, date, method, and its computed status (RECORDED or REVERSED, the latter marked "Reversed on <date>" as text as well as colour), and the total matches the filtered rows exactly.
7. **Given** a payment, **When** Omar opens its detail, **Then** it shows the allocations per invoice (invoice number, allocated amount, reversal state) and, when reversed, the reversal's date and reason.
8. **Given** a customer, **When** the Record payment screen asks for that customer's open invoices, **Then** it returns the customer's ISSUED or PARTIALLY_PAID invoices with remaining balance above zero, with those balances.
9. **Given** a record belonging to another organization, **When** Omar requests it by identifier, **Then** it is reported as not found.

---

### User Story 5 - Use the real Invoicing screens (Priority: P1)

As Omar, I want the Invoicing screens to use my organization's real orders, customers, invoices, and payments instead of sample data, so that what I see and post is real business data.

**Why this priority**: The backend is invisible until the screens stop using sample data. This story removes the sample banner, deletes the Invoicing sample data, and connects every invoicing surface to the real service.

**Independent Test**: Sign in to an organization with a shipped order; create, issue, void, and re-create an invoice; record and reverse a payment; print the invoice; confirm no sample-data banner appears anywhere in Invoicing and the sales order detail links to its invoice.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open any Invoicing screen, **Then** the sample-data banner is absent and the content comes from the organization's real records.
2. **Given** the invoice list, **When** it loads, **Then** the outstanding and overdue figures are the server-computed values, not sample figures.
3. **Given** the create dialog, **When** it opens, **Then** it lists only shipped orders without a non-void invoice.
4. **Given** the Issue, Void, Record payment, and Reverse dialogs, **When** a dialog opens, **Then** it generates its idempotency key and reuses it on every retry of the same attempt, so a double click acts once; an attempt that ended in a definite answer gets a new key on reopen, an attempt with an unknown outcome reuses the key.
5. **Given** an allocation error, BALANCE_CHANGED, or a usage refusal, **When** the screen shows it, **Then** the error appears inline with the request identifier.
6. **Given** a SHIPPED order's detail page, **When** the user looks for the next step, **Then** the "Create Invoice" action is enabled and links to its invoice when one exists (and creates the draft otherwise).
7. **Given** an invoice detail, **When** the user selects Print, **Then** the browser print shows only the invoice and the "Operational invoice - not a tax invoice" label, through a print stylesheet.
8. **Given** a user without an invoicing or payments permission, **When** they view a matching screen, **Then** actions they cannot perform are hidden or disabled using the permissions from GET /auth/me, while a direct API call is still refused by the server.
9. **Given** the Overview module, **When** it is used, **Then** it keeps its own private sample data and its Sales and Outstanding figures remain labelled sample until the dashboard feature exists.

---

### User Story 6 - Protect customers referenced by open invoices (Priority: P1)

As Hana, the administrator, I want the system to refuse archiving a customer while an invoice that is DRAFT, ISSUED, or PARTIALLY_PAID references it, so that an open invoice never points at a retired customer.

**Why this priority**: The usage guard is part of the feature's integrity contract. Without it, an open invoice can be left pointing at an archived customer who can no longer be contacted or billed correctly.

**Independent Test**: Issue an invoice to a customer; try to archive that customer; the refusal is 409 CONTACT_IN_USE and names the blocking invoice. Void or fully pay the invoice and repeat: archiving succeeds (subject to existing rules).

**Acceptance Scenarios**:

1. **Given** a customer on a DRAFT, ISSUED, or PARTIALLY_PAID invoice, **When** a user tries to archive it, **Then** the request is refused with 409 CONTACT_IN_USE, names the blocking invoice, and the customer remains active.
2. **Given** a customer referenced only by PAID or VOID invoices, **When** a user tries to archive it, **Then** the action is allowed, subject to the existing contact rules.

---

### Edge Cases

- Create for an order that already holds a non-void invoice: refused 409 INVOICE_ALREADY_EXISTS; the VOID invoice does not block re-invoicing.
- Create for an order that is not SHIPPED: refused 409 INVALID_STATE_TRANSITION; nothing is created.
- A draft whose customer or lines differ from the order at creation time: impossible; the draft is copied server-side from the order in the create transaction.
- Draft due date before the invoice creation date: refused.
- Issue without a due date: the draft's due date is kept (if the draft has none, issue defaults to issue date plus `default_payment_terms_days`); an issue-supplied due date before the issue date is refused 400 VALIDATION_ERROR; a draft due date that does not precede the creation date but precedes the issue date makes the issue refused 400 VALIDATION_ERROR naming the due date.
- Issue with a supplied due date before the issue date: refused 400 VALIDATION_ERROR.
- Issue with the same Idempotency-Key twice: the stored response; one number assigned, one audit entry.
- A double issue (two concurrent requests): exactly one transaction wins; the loser is refused (the invoice is no longer DRAFT), never two numbers for one invoice.
- Void with a reason missing: refused; a reason is always required.
- Void an ISSUED invoice that has active allocations: refused 409 INVOICE_HAS_PAYMENTS.
- A payment whose allocations name the same invoice twice: refused; one allocation per invoice per payment.
- A payment date in the future: refused.
- A payment amount of zero or negative: refused.
- Allocations summing below the payment amount (unallocated remainder): refused; overpayment refused; no unallocated credit exists.
- Two simultaneous payments against the same invoice: they lock in ascending invoice id order; both cannot allocate more than the balance together; the second sees the updated balance under the lock or is refused BALANCE_CHANGED.
- A payment racing a void of the same invoice: one outcome wins; either the payment finds no ISSUED invoice (refused) or the void is refused INVOICE_HAS_PAYMENTS. Never both applied.
- A reversal racing a new payment on the same invoice: consistent final state; the reversal restores balance from allocations still active after its own effect; no invoice ends PAID with a positive balance or PARTIALLY_PAID with a zero balance.
- A reversal of a payment partially allocated to several invoices: only the affected invoices are restored; each returns to ISSUED or PARTIALLY_PAID per its remaining active allocations.
- Archiving a customer with a PAID or VOID invoice only: allowed.
- An invoice overdue check at read time: due date before today (UTC) and balance above zero; never stored; flips back automatically when paid.
- A page size above 100: capped, not rejected.
- A payments date range whose end precedes its start: refused 400 VALIDATION_ERROR naming the date field.
- The invoice list's figures, rows, and total come from one snapshot; a payment posted between two list calls changes the figures, but a single call is internally consistent and a DRAFT-only selection shows 0.00.
- The payments status filter (Active/Reversed/All) and the method filter combine; the total always matches the filtered rows because the derived rule is one left join, never a per-row lookup.
- A reversed payment's allocations keep showing, labelled as reversed; its invoices' balances still count only allocations of payments without a reversal.
- A duplicate idempotency key with an identical body: stored response, one posting.
- A duplicate idempotency key with a different body: 422 IDEMPOTENCY_KEY_REUSED, nothing changes.
- A failure while writing the payment, an allocation, a status update, or the audit entry: complete rollback; no payment, no allocation, no status change, no audit entry, no key record.
- A posted payment, allocation, reversal, movement, or audit entry: cannot be updated, deleted, or truncated.
- An immutability trigger firing on an ISSUED invoice's lines or totals: refused at the database.
- An invoice whose paid plus balance does not equal its total, or whose status disagrees with its balance: impossible after any successful write; the invariant verification fails the build.
- A request for another organization's invoice, payment, allocation, or reversal by identifier: 404 on every endpoint.
- A user without any invoices or payments permission: 403 from every invoicing and payments endpoint.
- The module gate on every invoicing endpoint: declared like Purchasing and Sales; this feature ships no module state, so the gate allows every request until the settings feature enables the check.
## Requirements *(mandatory)*

### Functional Requirements

#### Data, numbering, exact amounts, and honesty

- **FR-001**: The system MUST store, per organization: invoices, invoice lines, payments, payment allocations, and payment reversals. Every organization-owned table MUST carry `organization_id`, and every foreign key between organization-owned tables MUST be composite over `(organization_id, id)` so a cross-tenant relation is impossible. All names MUST be snake_case.
- **FR-002**: An invoice MUST store its sales order, customer, status (`DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, or `VOID`), number (assigned at issue and null on a draft), issue date, due date, total NUMERIC(14,2), void reason, voided-at and voided-by, version, and timestamps. The number MUST be `INV-` followed by six digits from the organization's document sequence, allocated on first use under a per-organization advisory lock inside the issuing transaction, and MUST be unique per organization.
- **FR-003**: An invoice line MUST store its product, quantity NUMERIC(14,3) above zero, unit price NUMERIC(14,4) not negative, and line total NUMERIC(14,2). One product MUST appear at most once per invoice.
- **FR-004**: A payment MUST store its number (`PAY-` plus six digits from the same sequence allocation, assigned at creation), customer, amount NUMERIC(14,2) above zero, payment date, method (`CASH`, `BANK_TRANSFER`, `CARD`, or `OTHER`), optional reference, recorded-by user, and recorded-at timestamp.
- **FR-005**: A payment allocation MUST store its payment, invoice, and amount NUMERIC(14,2) above zero. A payment reversal MUST store its payment, reason, reversed-by user, and reversed-at timestamp; exactly one reversal MUST exist per payment. `payment_reversals` MUST be indexed on its payment id so the derived-status join stays cheap.
- **FR-006**: The organization MUST carry `default_payment_terms_days` (integer 0 to 365, default 30), added in a migration and exposed read-only like the currency; editing it is deferred to the Organization settings feature.
- **FR-007**: Money MUST be exact and server-side. Line total = quantity x unit price rounded half-up to two decimals; invoice total = the sum of the already-rounded line totals and MUST equal the sales order's total; balance = total minus the sum of allocations of payments with no reversal. The required vectors: 0.10 + 0.20 = 0.30; a total of 128.45 with allocations of 100.00 and 28.45 leaves a balance of 0.00; an allocation 0.01 above the balance is refused. No JavaScript floating-point arithmetic may carry a monetary or quantity value, and JSON MUST carry all amounts as decimal strings.
- **FR-008**: Every invoice representation - API payload, interface, printable output, and documentation - MUST carry the exact label "Operational invoice - not a tax invoice". No tax field, tax rate, or tax total may exist anywhere in this feature.
- **FR-009**: Immutability MUST be enforced by database triggers in one migration step: once ISSUED, an invoice's customer, order, lines, totals, number, and issue date can never change; only its status and void fields may change through the allowed transitions. Payments, payment allocations, and payment reversals MUST be append-only: UPDATE, DELETE, and TRUNCATE are rejected by triggers and the API roles' grants are revoked, using the existing append-only template, so the full set of triggers and revokes arrives from that single migration. Existing migrations are never edited.
- **FR-010**: Every new table MUST enable row-level security with no policies, following the existing tenant-isolation pattern. New migrations MUST be additive and immutable.

#### Invoice lifecycle

- **FR-011**: Creating an invoice MUST require `POST /sales-orders/:id/invoices` with `invoices.write` only (PRD 9.5 is authoritative; no sales permission is required in addition). The order MUST exist in the caller's organization (else 404, never 403) and MUST be SHIPPED (else 409 INVALID_STATE_TRANSITION) with no non-void invoice (else 409 INVOICE_ALREADY_EXISTS); the draft MUST copy the customer, lines, quantities, and prices from the order, calculate totals, and write its audit entry in the same transaction. The order is read through the Sales service inside the create transaction. A member holding `invoices.write` but not `sales.read` MUST be able to create an invoice for a shipped order in their own organization.
- **FR-012**: A draft invoice MAY change only its due date, which MUST NOT precede the invoice's creation date; its customer, order, lines, quantities, and prices MUST NOT be changeable. A draft's due date carries into the issue when the issue request supplies none (FR-013). A draft update MUST present the version the caller read; a stale version MUST return 409 STALE_VERSION and change nothing; a successful update MUST increment the version with its audit entry.
- **FR-013**: Issuing MUST require `invoices.issue` and an Idempotency-Key, and MUST happen in one transaction that locks the invoice, requires status DRAFT, assigns the number from the organization's sequence, sets the issue date, sets the due date, sets status ISSUED, increments the version, writes the audit entry, and stores the idempotency response - all together. The due date resolution at issue is, in order: (1) a due date supplied on the issue request, which MUST NOT precede the issue date; (2) the draft's due date, which MUST NOT precede the issue date either - if it does, issuing is refused with 400 VALIDATION_ERROR naming the due date; (3) the default: issue date plus `default_payment_terms_days`.
- **FR-014**: Voiding MUST require `invoices.void`, an Idempotency-Key, and a written reason. It MUST be allowed for DRAFT, and for ISSUED with no active allocations. PARTIALLY_PAID and PAID MUST be refused with 409 INVOICE_HAS_PAYMENTS ("reverse the payments first"). A voided invoice MUST remain in history as VOID, and its order MUST be invoicable again. The void reason, voided-at, and voided-by MUST be stored with the audit entry in the same transaction.
- **FR-015**: The only permitted invoice transitions are: DRAFT -> ISSUED (issue), DRAFT -> VOID, ISSUED -> VOID (no active allocations), ISSUED -> PARTIALLY_PAID, ISSUED -> PAID, PARTIALLY_PAID -> PAID, and PAID or PARTIALLY_PAID back to ISSUED or PARTIALLY_PAID through payment reversal. Any other transition MUST return 409 INVALID_STATE_TRANSITION.
- **FR-016**: An invoice's status MUST agree with its balance at all times: ISSUED means no active allocations (balance equals total), PARTIALLY_PAID means a balance above zero and below total, PAID means balance exactly zero. A payment MUST set PARTIALLY_PAID or PAID accordingly, with PAID only when the balance is exactly zero.
- **FR-017**: Overdue MUST be derived at read time (due date before today in UTC AND balance above zero) and MUST NOT be stored.
- **FR-018**: Issue and void MUST be idempotent on the Idempotency-Key: the same key and the same request MUST return the stored response and perform no second posting; the same key with a different body MUST return 422 IDEMPOTENCY_KEY_REUSED and change nothing; the key record, request fingerprint, response, and expiry MUST commit in the same transaction as the business change; a failed transaction MUST store no key record. The draft update (FR-012) does NOT require an Idempotency-Key (PRD 9.5 marks `PUT /invoices/:id` as non-idempotent); the DRAFT-only and version checks are its guard.

#### Payments and allocations

- **FR-019**: Recording a payment MUST require `payments.record` and an Idempotency-Key, and MUST happen in ONE transaction that: validates amount above zero and a payment date not in the future; validates that the allocations EQUAL the payment amount exactly (an overpayment or any unallocated remainder is refused); validates every invoice belongs to the same customer and organization and is ISSUED or PARTIALLY_PAID; locks the invoices in ascending id order and recomputes each balance under the lock; refuses any allocation above the recomputed balance; refuses with 409 BALANCE_CHANGED naming the invoice and its current balance when a balance changed since the client read it; creates the payment and its allocations; sets each invoice to PARTIALLY_PAID or PAID; writes the audit entry; and stores the idempotency response - all together. A failure at any step MUST leave nothing changed.
- **FR-020**: Each allocation in the request MUST carry the invoice balance the client read. When the recomputed balance under the lock differs from that client-read balance, the payment MUST be refused with 409 BALANCE_CHANGED naming the invoice and its current balance. When the recomputed balance matches but the allocation exceeds it, the payment MUST be refused (400 OVER_ALLOCATION); allocations not summing to the payment amount MUST be refused with 400 VALIDATION_ERROR; an allocation to a DRAFT, VOID, or PAID invoice, or to another customer's or organization's invoice, MUST return 409.
- **FR-021**: Reversing a payment MUST require `payments.reverse`, an Idempotency-Key, and a written reason. It MUST create a payment_reversals record (the payment row is never changed), restore each affected invoice's status according to its remaining active allocations (PAID or PARTIALLY_PAID back to ISSUED or PARTIALLY_PAID), and write the audit entry in the same transaction. A second reversal of the same payment MUST be refused with 409.
- **FR-022**: Concurrent payments against the same invoice MUST never over-allocate it; the ascending-id lock order and the balance recompute under the lock MUST make the outcome exact.

#### Reads

- **FR-023**: The system MUST expose a paginated invoice list with search by number or customer, a status filter, an overdue-only filter, sorting, page and page size capped at 100, a whole-selection total for the matching set, and server-computed outstanding and overdue balances covering exactly that same matching set (all pages, independent of page and pageSize). Outstanding is the sum of balances of ISSUED and PARTIALLY_PAID invoices in the selection; overdue is the part of that sum belonging to invoices whose due date is before today (UTC) with a balance above zero; DRAFT, PAID, and VOID invoices contribute 0.00. The figures MUST be exact server-side decimal strings; MUST be computed by one shared definition (a single database view or service function reused by the invoice list, the later Outstanding Invoices report, and the Dashboard); MUST be computed from one snapshot with the rows and the total (one transaction or one consistent query); and MUST NOT change when only page or pageSize changes. The interface MUST label them "Outstanding in this selection" and "Overdue in this selection", show them even for an empty selection (0.00), and state the filters they reflect when any filter is active; there is no organization-wide card on this screen.
- **FR-024**: The system MUST expose a single-invoice detail carrying its lines, totals, and the payments applied (allocation amounts, payment numbers and dates, and reversal state).
- **FR-025**: The system MUST expose a paginated payment list with search by number or customer, a status filter with the values Active (RECORDED), Reversed (REVERSED), and All (default All) derived from the existence of a payment_reversals row - payments carry no status column and stay append-only - a payment-method filter (Cash, Bank transfer, Card, Other, All) independent of the status filter, a payment-date range whose end MUST NOT precede its start (else 400 VALIDATION_ERROR naming the date field), sorting, page, page size capped at 100, and a whole-selection total. Each row and the detail MUST carry the computed status (RECORDED or REVERSED). The filter, the rows, and the total MUST be computed by the same derived rule in one query (a left join to payment_reversals), so the total always matches the filtered rows. payment_reversals MUST be indexed on its payment id. The list MUST mark reversed payments "Reversed on <date>" as text as well as colour.
- **FR-026**: The system MUST expose a single-payment detail carrying: the payment's fields and its computed status (RECORDED or REVERSED); its allocations (invoice number and amount each); and, when reversed, the reversal's date and reason. A payment's allocated amounts to invoices MUST remain visible after reversal, labelled as reversed, because history is never rewritten; invoice balances count only allocations of payments without a reversal. It MUST also expose a read of a customer's open invoices (ISSUED or PARTIALLY_PAID with balance above zero) for the Record payment screen.
- **FR-027**: Every read MUST be scoped to the organization resolved from the signed-in session; another organization's record MUST return 404 on every endpoint, including detail, list, and mutation.

#### Permissions, module gate, audit, and usage protection

- **FR-028**: Every invoicing and payments endpoint MUST declare exactly one required permission in a decorator: reads use `invoices.read` or `payments.read`; create and draft update use `invoices.write`; issue uses `invoices.issue`; void uses `invoices.void`; record uses `payments.record`; reverse uses `payments.reverse`. Missing or inactive membership or an absent permission MUST return 403.
- **FR-029**: Every invoicing endpoint MUST declare the shared Invoicing module gate - one guard or decorator named for the module - which currently allows every request; the gate MUST be the single place where a later module-disabled check is enabled. This feature MUST NOT add a module table, a module-toggle endpoint, or a module-toggle interface; the module-disabled refusal (403 MODULE_DISABLED) is owned by the Organization settings feature, and the canonical documentation MUST record that ownership. An automated test MUST assert every invoicing endpoint declares the gate.
- **FR-030**: Every create, draft update, issue, void, payment, and reversal MUST write an audit entry with before and after values, the acting user, and the affected record, in the same transaction as the business change; a failed audit insert MUST roll the change back.
- **FR-031**: Archiving a customer that appears on any DRAFT, ISSUED, or PARTIALLY_PAID invoice MUST be refused with 409 CONTACT_IN_USE naming the blocking invoice. PAID and VOID invoices MUST NOT block archiving.

#### Interface

- **FR-032**: The Invoicing screens - invoice list with the outstanding and overdue figures, the create dialog listing shipped orders without an invoice, the invoice detail page, the Issue and Void dialogs, the Record payment screen with the open-invoice allocation table, the Payments list and detail, and the Reverse dialog - MUST read and write the real service through the existing service seam. The Invoicing sample data MUST be deleted and the Sample data banner MUST no longer appear on those screens.
- **FR-033**: The Sales order detail's "Create Invoice" action MUST become enabled for a SHIPPED order and MUST link to its invoice when one exists; it stays disabled with the reason "Arrives with Invoicing" only until this feature is live.
- **FR-034**: Print MUST use the browser with a print stylesheet showing only the invoice and the "Operational invoice - not a tax invoice" label. No PDF generation or emailing exists in this feature.
- **FR-035**: The Issue, Void, Record payment, and Reverse dialogs MUST generate their idempotency key when they open and reuse it on every retry of the same attempt, so a double click acts once. After a definite answer (success or definite failure), reopening MUST generate a new key; after an unknown outcome (timeout, lost connection), reopening MUST reuse the same key.
- **FR-036**: Allocation errors, BALANCE_CHANGED, and usage refusals MUST show inline with the request identifier the user can quote. A usage refusal MUST name the blocking invoice; an over-allocation refusal MUST name the invoice and its balance; a sum-mismatch refusal MUST explain that allocations must equal the payment amount.
- **FR-037**: Actions the signed-in member lacks permission for MUST be hidden or disabled using the permissions from GET /auth/me. Hiding is a usability measure only; the server MUST remain the authority and MUST reject a direct call.
- **FR-038**: The still-sample Overview module MUST keep its own private sample data; its Sales and Outstanding figures MUST stay labelled sample until the dashboard feature exists.

#### Contract, invariants, and verification

- **FR-039**: The OpenAPI contract and the canonical Invoicing documentation MUST be regenerated from the implemented endpoints, and the contract-drift check MUST pass.
- **FR-040**: The database invariant verification MUST prove: an invoice's total equals the sum of its lines and its sales order's total; a balance is never negative and paid plus balance equals total; an invoice's status agrees with its balance; every ISSUED, PARTIALLY_PAID, or PAID invoice has a number and a due date; only one non-void invoice exists per sales order; every payment's allocations sum to its amount; payments, allocations, and reversals reject update, delete, and truncate and hold no API-role grants; issued invoices reject changes to their lines and totals; the unfiltered outstanding and overdue figures equal the invoices' balances in the database.
- **FR-041**: The automated tests MUST cover tenant isolation and permissions for every endpoint (including a member holding `invoices.write` without `sales.read` creating an invoice, and a member holding `sales.write` without `invoices.write` receiving 403), the module-gate declaration, the concurrency cases (two simultaneous payments against the same invoice cannot over-allocate; a payment racing a void; a reversal racing a new payment; a double issue), duplicate requests, rollback on a failing allocation or audit write, immutability verified with direct SQL against issued invoices and the append-only tables, the rounding vectors, the usage hook, the figures and rows and total of the invoice list coming from one snapshot (the figures equal the sum over all pages, are unaffected by page and pageSize, and the unfiltered figures equal the invoices' balances in the database), and the payments filters (the derived status filter returns the right rows and total with a mix of reversed and active payments across several pages; the method filter combines with the status filter; the total always matches the filtered rows) - and the invariant script. Critical-path coverage MUST reach at least 80%.
- **FR-042**: Integration tests MUST run against a real PostgreSQL instance in the isolated test schema only, with the same API-role grants as public, leaving public row counts unchanged. Tests MUST NOT use SQLite, in-memory persistence, or mocked database transactions for the critical rules. The contract-drift check and every existing guard MUST pass.

### Key Entities *(include if feature involves data)*

- **Invoice**: the organization's bill to a customer for one shipped sales order, with an INV- number (assigned at issue), customer, sales order, status, issue date, due date, total, void reason/at/by, version, creator, and timestamps. Immutable once ISSUED except status and void fields.
- **Invoice line**: one product on an invoice, with quantity, unit price copied from the order, and the rounded line total.
- **Payment**: a recorded customer payment with a PAY- number, customer, amount, payment date, method, reference, and recorded-by/at. Append-only.
- **Payment allocation**: the application of part of a payment to one invoice, with an amount above zero. Append-only.
- **Payment reversal**: the compensating record that cancels a payment's effect, with a reason, reversed-by, and reversed-at. One per payment; the payment row is never changed.
- **Organization default payment terms**: `default_payment_terms_days` (0-365, default 30), read-only in this feature.
- **Idempotency record**: the stored outcome of one issue, void, payment, or reversal attempt, scoped by organization, endpoint, and key, with the request fingerprint, response, and expiry.
- **Audit entry**: the before-and-after record of every invoicing create, update, issue, void, payment, and reversal.

## Constitution Compliance *(mandatory)*

- **I. Tenant isolation:** Every new table (`invoices`, `invoice_lines`, `payments`, `payment_allocations`, `payment_reversals`) carries `organization_id`; every organization-owned relation is composite `(organization_id, id)`; every query resolves the organization from the session context; another organization's records return 404. Every endpoint has a two-organization isolation test. RLS is enabled on every new table with no policies.
- **II. Server-enforced authority:** Each endpoint declares `invoices.read`, `invoices.write`, `invoices.issue`, `invoices.void`, `payments.read`, `payments.record`, or `payments.reverse`, and declares the shared Invoicing module gate. The server validates every status transition, every active/archived reference, every amount, every allocation, and every version; invalid transitions return 409 INVALID_STATE_TRANSITION; the interface only hides actions and is never the authority.
- **III. Transactional integrity:** Create, draft update, issue, void, payment, and reversal are single transactions covering locks, writes, balance changes, status updates, audit entries, and idempotency records. Issued invoices, payments, allocations, reversals, movements, and audit entries are immutable at the database level. Duplicate posting is impossible even without a key, through status checks, conditional updates, unique constraints, and the one-non-void-invoice-per-order partial unique index. Payment allocations are locked in ascending invoice id order to prevent deadlocks.
- **IV. Exact decimals:** Quantities are NUMERIC(14,3); unit prices NUMERIC(14,4); line totals, invoice totals, and payment amounts NUMERIC(14,2). Rounding is half-up per line at the point the value is persisted; the invoice total sums the already-rounded line totals; balance derives from exact sums of allocations. All arithmetic is server-side exact decimal; JSON carries strings. The vectors 0.10 + 0.20 = 0.30, 128.45 - (100.00, 28.45) = 0.00, and the refusal of 0.01 above balance are tests.
- **V. Test-first:** The failing tests are written before implementation: tenant isolation and permissions for every endpoint, the module-gate declaration, two simultaneous payments, payment-versus-void, reversal-versus-payment, double issue, duplicate requests, rollback on allocation or audit failure, append-only protection with direct SQL, rounding vectors, the usage guard, and the invariant script. Integration tests use real PostgreSQL in the isolated schema and leave public counts unchanged.
- **VI. Module boundaries:** Invoicing owns its invoices, lines, payments, allocations, and reversals. It calls the owning modules' services for the sales order and the customer (it never writes the Sales or Contacts tables), and the Contacts service answers the usage guard. Circular dependencies are prohibited; shared behavior enters through an explicitly owned interface.
- **VII. Honest boundaries:** Operational invoices only; no taxes, no credit notes, no e-invoicing, no accounting entries. Every invoice is labelled "Operational invoice - not a tax invoice" in API payloads, the interface, printable output, and documentation. No label implies tax compliance or complete accounting.
- **VIII. Design system and accessibility:** The existing Invoicing screens keep the design-system tokens and components. The feature implements the PRD 7.3 rules: inline validation, skeleton loading, disabled submits with spinners, request-identifier errors, named success toasts, confirmation dialogs for irreversible issue/void/reverse actions, status badges matching API names, and server-paginated tables with visible totals. WCAG 2.1 AA keyboard, focus, labeling, and error-message requirements apply.
- **IX. Scope discipline:** This is P0-F010 and P0-F011. The feature is limited to invoicing from shipped orders, issue, void, payment recording with allocation, reversal, the real Invoicing interface, and the required usage guard. Taxes, credit notes, partial invoicing, discounts, recurring invoices, PDFs, gateways, and accounting entries are out of scope. Overview stays sample until the dashboard feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An invoicing user can create, issue, void, re-create, and print an invoice from a shipped order without leaving the Invoicing screens; the invoice carries its number, issue date, and due date, and the print output shows only the invoice and the "Operational invoice - not a tax invoice" label.
- **SC-002**: A shipped order with a non-void invoice can never receive a second one; a VOID invoice never blocks re-invoicing.
- **SC-003**: Two simultaneous payments against the same invoice produce at most one set of allocations; the balance never goes negative; a payment racing a void yields exactly one consistent outcome; a reversal racing a new payment yields exactly one consistent final state; a double issue yields exactly one number.
- **SC-004**: A request sent twice with the same idempotency key creates exactly one posting; a reused key with a different body returns 422 and changes nothing.
- **SC-005**: A failure in payment creation, allocation writing, or audit writing leaves zero payments, zero allocations, zero status changes, and zero audit entries.
- **SC-006**: All required rounding vectors produce exactly 0.30, 0.00, and a refusal; every invoice total equals the sum of its line totals and its order's total.
- **SC-007**: 100% of invoicing and payments endpoints have passing tenant-isolation and permission tests, and 0 cross-organization records are readable or mutable.
- **SC-008**: Every attempt to update, delete, or truncate a payment, allocation, reversal, posted movement, or audit entry, or to change an issued invoice's lines or totals, is refused by the database.
- **SC-009**: Archiving a customer with a DRAFT, ISSUED, or PARTIALLY_PAID invoice is refused 100% of the time with 409 CONTACT_IN_USE naming the blocking invoice.
- **SC-010**: Release checks prove that every invoice total equals the sum of its lines and its order's total, no balance is negative, paid plus balance equals total, every invoice's status agrees with its balance, every ISSUED/PARTIALLY_PAID/PAID invoice has a number and a due date, one non-void invoice exists per order, every payment's allocations sum to its amount, the published API contract matches the implementation, and the test run leaves unrelated public data unchanged.
- **SC-011**: The Invoicing screens show zero sample-data banners and read 100% of their invoicing data from the organization's real service; the Sales order detail's "Create Invoice" action is enabled for shipped orders and links to the invoice.
- **SC-012**: A double click in the Issue, Void, Record payment, or Reverse dialog acts once; a retry after an unknown outcome reuses the same key and does not post twice.
- **SC-013**: The invoice list returns the outstanding and overdue figures for its selection within one request; a date range whose end precedes its start on the payments list is refused with 400 VALIDATION_ERROR naming the date field; page sizes above 100 are capped, not rejected.
- **SC-014**: Every INV- and PAY- number comes from a sequence created on first use under a per-organization advisory lock; no number is allocated twice within an organization, and the database refuses a duplicate number for one organization.
- **SC-015**: Every invoicing endpoint declares its permission and the shared Invoicing module gate, proved by an automated test, and this feature ships no module table, no module-toggle endpoint, and no module-toggle interface.

## Assumptions

- `POST /sales-orders/:id/invoices` requires `invoices.write` only - the PRD 9.5 row is authoritative; no sales permission is required, and the order is read through the Sales service inside the create transaction (other organization's order: 404, never 403). See the Clarifications session.
- Document numbers `INV-` and `PAY-` keep the six-digit width and the same first-use, per-organization advisory-lock allocation as the existing document numbers; each document type has its own `document_sequences` row. Invoice numbers are assigned at issue; payment numbers are assigned at creation.
- The due date at issue resolves in order: issue-request value (not before the issue date) > the draft's due date (kept when the request supplies none; it too may not precede the issue date, else 400 VALIDATION_ERROR) > default issue date plus `default_payment_terms_days`. A draft's due date may never precede the creation date. See the Clarifications session (Q, Session 2026-11-14, draft vs issue due dates).
- The invoice list's outstanding and overdue figures cover exactly the selection matching the current search, status, and overdue filters - all pages, independent of page and pageSize - computed as one shared definition (a single database view or service function reused by the list, the later Outstanding Invoices report, and the Dashboard) from one snapshot with the rows and the total; they are labelled "Outstanding in this selection" and "Overdue in this selection", shown even when empty (0.00), and the interface states the filters they reflect when any filter is active. The unfiltered figures equal the invoices' balances in the database (in the invariants script). No organization-wide card exists on this screen; it arrives with the Dashboard.
- The payments list exposes a status filter with the values Active (RECORDED), Reversed (REVERSED), and All (default All), derived from the existence of a payment_reversals row; no status column is added to payments, which are append-only. The filter, the rows, and the total use the same derived rule in one query (a left join to payment_reversals), so the total always matches the filtered rows; payment_reversals is indexed on its payment id. An independent method filter (Cash, Bank transfer, Card, Other, All) is also provided. Reversed payments show the reversal's date and reason in the detail, are marked "Reversed on <date>" as text as well as colour in the list, and keep their allocated amounts visible labelled as reversed; invoice balances count only allocations of payments without a reversal.
- Default payment terms apply only as the due-date default at issue; an organization without a value uses 30 days. Editing `default_payment_terms_days` ships with the Organization settings feature; this feature exposes it read-only alongside the currency.
- An allocation request carries the balance the client read for each invoice; the server never trusts it and recomputes under the lock - the client-read value exists to detect a stale read (409 BALANCE_CHANGED).
- Balance = total minus allocations of payments with no reversal. Reversing a payment restores balances and statuses from the remaining active allocations; the payment row is never changed.
- The one-non-void-invoice-per-order rule is a partial unique index on `(organization_id, sales_order_id)` where status is not VOID; VOID invoices remain in history and never block re-invoicing.
- The usage guard concerns customers (contacts) only; archiving a product or deactivating a warehouse is governed by the existing guards and this feature adds none for invoices.
- Invoice statuses are exactly `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`; methods are exactly `CASH`, `BANK_TRANSFER`, `CARD`, `OTHER`; a payment's computed status is exactly `RECORDED` or `REVERSED`, derived from the existence of a payment_reversals row and never stored as a column.
- Default page size is 25; maximum page size is 100. List totals count the whole selection, not the visible page.
- Error codes: content-validation failures return 400 `VALIDATION_ERROR` with field details; `OVER_ALLOCATION` returns 400; `INVOICE_HAS_PAYMENTS`, `BALANCE_CHANGED`, `CONTACT_IN_USE`, `STALE_VERSION`, `INVALID_STATE_TRANSITION`, and `INVOICE_ALREADY_EXISTS` return 409; `IDEMPOTENCY_KEY_REUSED` returns 422.
- The existing Invoicing screens, routes, design-system components, and translation structure are reused; this feature replaces their data source and behavior, not their visual language.
- The Sales order detail's "Create Invoice" action becomes enabled in this feature; the Overview module keeps its private sample data, labelled sample, until the dashboard feature.
- No feature in this specification claims tax compliance, certified invoicing, or complete accounting.
- This feature is out of scope: taxes, credit notes, partial invoicing and several invoices per order, discounts, recurring invoices, generating PDFs or emailing invoices, payment gateways, unallocated credit and overpayments, supplier bills, and accounting entries.

