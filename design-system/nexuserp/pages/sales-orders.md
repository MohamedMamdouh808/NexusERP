# Sales Orders Page Overrides

> **PROJECT:** NexusERP
> **Generated:** 2026-10-18
> **Page Type:** List, create/edit form, and detail screens for Sales Orders

> **IMPORTANT:** Rules in this file **override** the Master file
> (`design-system/nexuserp/MASTER.md`) for the Sales Order screens only.
>
> This file defines **layout and behavior only**. It defines no colors, no fonts, no spacing
> values, no shadows, no style tokens, and no page pattern. All visual and token decisions —
> color palette, semantic status tokens, status badge mapping, typography and the Fira Code
> treatment for SKUs and document numbers, spacing, shadows, the authenticated app shell,
> light-mode-only and desktop/tablet targets, and the PRD Section 7.3 UX rules — are inherited
> from the Master file. Where this file is silent, the Master file governs without exception.

---

## Screens

This page file covers three screens, all rendered inside the Master authenticated app shell
(persistent left sidebar, top bar with organization switcher and user menu, content area):

1. **Sales Order List** — `/sales-orders`
2. **Sales Order Create / Edit Form** — `/sales-orders/new`, `/sales-orders/:id/edit`
3. **Sales Order Detail** — `/sales-orders/:id`

All three screens share the content area structure defined in the Master app shell. None of
them introduces a hero, marketing block, or any other landing-page pattern.

---

## 1. Sales Order List

### Content Area Order

```text
Page header (title "Sales Orders" + primary action "New Sales Order")
Filters bar
Data table (or empty state)
Pagination control with total count
```

### Filters Bar

- One row, wrapping onto a second row on tablet.
- Controls, left to right:
  1. **Search** — free text over order number and customer name. Debounced input.
  2. **Status** — single-select filter over the order status values returned by the API.
  3. **Date range** — from and to date inputs. An end date before the start date is rejected
     inline on blur and on submit.
  4. **Clear filters** — shown only when at least one filter is active. Resets the filter
     set and returns to the first page.
- Filter state is reflected in the URL so a reload preserves it and a filtered view can be
  shared within the same organization.
- Filtering, sorting, and pagination are executed on the server. The client never filters,
  sorts, or pages an already-fetched array.

### Data Table Columns

| Column | Content | Alignment and treatment |
|---|---|---|
| Number | Order number, e.g. `SO-000042` | Left; Master mono font, verbatim from the API |
| Customer | Customer name | Left |
| Status | Status badge | Left; status name identical to the API, per the Master Status Badge Mapping |
| Total | Order total | Right; Master mono font, tabular numerals |
| Date | Order date | Left; locale-formatted |

- The table is sortable server-side. Sortable columns are Number, Customer, Status, Total,
  and Date; each header control shows its sort direction and is keyboard operable.
- Sort, filter, and page selection are sent as query parameters and returned in the
  pagination metadata so the table can reflect server state after a navigation or retry.
- Row click navigates to the detail screen. The whole row is not a control; the order number
  is the row's accessible link target.

### Pagination and Total Count

- Pagination is server-side and sits below the table.
- A visible total count accompanies every list, stating the number of matching records in
  the current filter, for example "248 sales orders". The count comes from the server.
- Default page size 25, maximum 100, matching the Master and the API contract.

### Empty States

Two distinct empty states; neither is an error:

- **No sales orders for this organization** — a panel explaining that sales orders record a
  customer's requested goods and drive reservation, shipment, and invoicing, with the
  primary action "New Sales Order".
- **Filters match nothing** — a panel stating "No records match the selected filters." with
  a "Clear filters" action. The "New Sales Order" action is not the primary action here.

### Loading and Error Behavior

- While the list is fetching, the filters bar renders at full width and the table area shows
  a skeleton placeholder with the same column count; no empty state flashes during load.
- A failed fetch replaces the table area with the Master error panel carrying a Retry action.
  Filter values are preserved so a retry repeats the same request.

---

## 2. Sales Order Create / Edit Form and Detail

The create, edit, and detail screens share one layout. The detail screen is the same layout
with editing disabled according to the current status.

### Page Header

- Order number in the Master mono font, verbatim from the API (`SO-000042`). A draft that
  has not been saved has no number and shows "New sales order" instead.
- Status badge next to the number, per the Master Status Badge Mapping.
- Actions on the right. **Each action renders only when the current status permits it and the
  user holds the required permission. An action that does not render is still rejected by the
  API; hiding it is usability, not authorization.**

| Action | Shown when status is | Required permission |
|---|---|---|
| Save draft | DRAFT | `sales.write` |
| Confirm | DRAFT | `sales.write` |
| Ship | CONFIRMED (and PARTIALLY_SHIPPED, P1) | `inventory.ship` |
| Create Invoice | SHIPPED (and PARTIALLY_SHIPPED, P1) | `invoices.write` |
| Cancel | DRAFT or CONFIRMED | `sales.write` |

- The primary action is the next meaningful step in the workflow — Confirm on a draft, Ship on
  a confirmed order — so it renders first and reads as primary.
- At least one order line is required before Confirm is enabled; the button stays disabled
  and the reason is stated in the line-items area rather than on a disabled tooltip.

### Header Fields — Two Columns

Three fields in a two-column grid, in this order:

```text
Row 1: Customer (col 1)          Warehouse (col 2)
Row 2: Order date (col 1)        [empty]
```

- **Customer** — searchable selector. Only active customers appear; archived customers are
  excluded from selection.
- **Warehouse** — selector, defaulting to the organization's default warehouse. Only
  warehouses the user can select are listed.
- **Order date** — date input, defaulting to today. The server remains authoritative.
- Each field has a visible label bound to its control.
- On tablet, the two columns collapse to one column in the same order; no field is reordered
  or hidden.

### Line Items Table

Columns:

| Column | Content | Alignment and treatment |
|---|---|---|
| # | Line number | Left |
| Product | Product selector per row | Left |
| Quantity | Quantity input | Right; Master mono font, tabular numerals |
| Unit price | Unit price input | Right; Master mono font, tabular numerals |
| Line total | quantity x unit price, half-up to two decimals | Right; Master mono font, tabular numerals |
| Remove | Remove-line control | Center |

- **Unit price defaults to the selected product's selling price** when a product is chosen. A
  user may then override the price; the field is never locked to the catalog value.
- **Price change rules:** editing a unit price changes only the line being edited. Existing
  confirmed, shipped, or invoiced prices are copied onto their documents and are never
  affected by a later catalog price change.
- **Line total recalculates on every quantity or price change**, using the same half-up
  rounding as the server, so the figure shown matches the figure the server persists.
- **Add line** appends a row and focuses the product selector on that row.
- **Remove line** deletes that row after a confirmation when the order has saved lines. The
  last remaining line cannot be removed; instead its fields are cleared so the row can be
  reused.
- Totals are recomputed from the unrounded client-side values and displayed rounded, exactly
  as the Master typography rules require; the server response is authoritative after save.

### Line Item Keyboard Support

- Tab and Shift+Tab move through cells in visual order, row by row.
- Enter inside the product, quantity, or unit price cell commits the value and moves to the
  next cell; it does not submit the form.
- Enter in the last cell of a row adds the next line and focuses its product selector.
- Arrow keys move between rows within the same column.
- Delete on a focused row triggers that row's remove control.
- Escape inside a cell reverts it to its last saved value.
- Every shortcut is available without a mouse; focus is always visible and no cell is a
  keyboard trap.

### Totals Panel

- Positioned to the right of the line items area on desktop, directly below the line items on
  tablet. It is present on every screen in this flow, including read-only ones.
- Contains the order total, right-aligned, in the Master mono font with tabular numerals so
  digits stay aligned as values change.
- Updates live on every line edit, immediately and without a save. The value is announced
  politely to assistive technology so the change is not silent.
- The panel is not a form control; no editing happens in it.

---

## 3. Editing Rules

- **Lines are editable only while the order is DRAFT.** In DRAFT the product, quantity, and
  unit price cells are enabled inputs and the remove control is available.
- **CONFIRMED, SHIPPED, and CANCELLED orders are read-only.** Every line cell renders as
  static text in the same column position, the remove control is not rendered, and Add line
  is not rendered. Reading a read-only order uses the same layout as editing it, so columns
  never shift between states.
- **Header fields follow the same rule.** Customer, warehouse, and order date are editable
  only in DRAFT.
- On a read-only order the form controls are replaced by their values rather than disabled,
  so the screen cannot be mistaken for an editable form.
- **Reservation details are visible on CONFIRMED and later orders** — a reservations panel
  beneath the line items showing each product, the reserved quantity, and the reservation
  status. Reservations are read-only here; they are released by cancelling the order and
  consumed by shipping it.
- **Shipment details are visible on SHIPPED and later orders** — a shipment panel beneath the
  line items showing the shipment number, shipped quantity per line, shipped date, and the
  shipped-by user. Shipments are never edited from the order screen.
- On CANCELLED orders the reservation and shipment panels remain visible with their history
  so a cancelled order still explains what happened, and a read-only notice states that the
  order is cancelled and cannot be reopened.
- Read-only screens are still reachable directly by URL; the API rejects a write against a
  non-draft order regardless of what the screen renders.

---

## 4. Feedback

### Field-Level

- Inline field errors appear on blur and again on submit, under the offending control, with
  the control linked to the message for assistive technology.
- The server validation response is authoritative and maps onto the same fields.
- A failed save keeps every entered value, including line items, so nothing is retyped.

### Loading

- Every fetch shows a skeleton placeholder: a skeleton page header, skeleton filter controls,
  and a skeleton table with the real column count.
- Submit buttons show a spinner and are disabled while the request is in flight. A retried
  submit reuses the same idempotency key so no duplicate order or reservation is created.

### Success

- A success toast names the affected record and the outcome, for example
  "Sales order SO-000042 confirmed". Creation, save, confirm, ship, invoice creation, and
  cancel each name the record they affected.
- After a successful confirm, ship, or cancel the visible status badge updates immediately
  without a page reload.

### Insufficient Stock Failure (409 `INSUFFICIENT_STOCK`)

When confirming an order fails because a line is short:

- An error banner renders directly above the line items, not as a toast and not as a
  page-level failure. The banner states that nothing was reserved.
- The banner lists **every** short line — never only the first — each with the product name,
  the available quantity, and the required quantity.
- Every affected line row is highlighted in the line items table and the row is marked for
  assistive technology, so the banner and the table identify the same lines.
- The order stays in DRAFT with all entered values intact and remains editable, so the user
  can change quantities or products and confirm again.
- The confirm dialog is dismissed and the page returns to the editable state; no partial
  reservation is left behind.

### Confirmation Dialogs

Confirm, Ship, and Cancel each open a confirmation dialog before running, stating the
consequence in plain language in terms of what will change for this order:

- **Confirm** — states that stock will be reserved for every line, that the order can no
  longer be edited, and that confirming with insufficient stock reserves nothing.
- **Ship** — states that stock will be deducted, reservations consumed, and the order marked
  shipped; the shipped order cannot be edited or cancelled.
- **Cancel** — states that all active reservations will be released and stock returned to
  available. Cancelling is only offered on DRAFT and CONFIRMED orders; a shipped or
  cancelled order offers no Cancel action and no Cancel route.
- Save draft and Create Invoice do not require a confirmation dialog; they are reversible or
  non-destructive.
- The dialog names the order it affects, takes focus on open, closes on Escape, and focuses
  the confirm control.

---

## 5. Responsive Behavior (Desktop and Tablet Only)

- Desktop and tablet are the only v1 targets, per the Master file. No phone layout is
  designed for these screens and no phone breakpoint is added.
- **Desktop (1024px and wider):** header fields keep two columns; the line items table and
  the totals panel sit side by side with the totals panel on the right.
- **Tablet (768px to 1023px):** header fields collapse to a single column in the same order;
  the line items table and the totals panel stack, with the totals panel below the table and
  still fully visible.
- **On tablet the line items table scrolls horizontally inside its own container.** The table
  does not compress, does not drop columns, and does not shrink cells below readable width.
  The container clips and scrolls; the page itself does not scroll horizontally, and no
  content is hidden behind a fixed element.
- The horizontal scroll container is keyboard reachable, labelled as scrollable, and
  scrollable with arrow keys, so the right-hand numeric columns are reachable without a
  pointer.
- The page header with the order number, status badge, and actions stays visible while the
  line items area scrolls, so the workflow state and the available actions never leave the
  screen.
- The totals panel is never inside the horizontally scrolling container, so the order total
  stays readable at every width.

---

## Inheritance Checklist

Before delivering any of these screens, confirm that nothing here has redefined a token:

- [ ] No hex values, color names, or gradient definitions in this file
- [ ] No font-family declarations beyond naming the Master font treatment for the order
      number, SKU, and numeric columns
- [ ] No spacing, radius, or shadow values
- [ ] No page pattern other than the Master authenticated app shell
- [ ] Status badge treatment follows the Master Status Badge Mapping, unmodified
- [ ] The Master PRD Section 7.3 UX rules and WCAG 2.1 AA requirements apply in full