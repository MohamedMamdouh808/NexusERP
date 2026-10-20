# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** NexusERP
**Generated:** 2026-10-18 00:03:21
**Category:** Analytics Dashboard

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary / Accent | `#4458E5` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#E0E7FF` | `--color-secondary` |
| On Secondary | `#1F2937` | `--color-on-secondary` |
| Accent/CTA | `#4458E5` | `--color-accent` |
| On Accent/CTA | `#FFFFFF` | `--color-on-accent` |
| Background | `#F5F7FB` | `--color-background` |
| Foreground | `#1F2937` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#1F2937` | `--color-card-foreground` |
| Muted | `#F1F4F9` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#E2E8F0` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#4458E5` | `--color-ring` |
| Input Border | `#64748B` | `--color-input-border` |
| Overlay / Backdrop | `rgba(0,0,0,0.5)` | `--color-overlay` |

**Color Notes:** Near-black slate is used for body text and headings. Indigo blue is
reserved for links, the active navigation pill, focus, and primary accents. Surfaces
stay white over a pale blue-grey canvas; structural borders stay soft.

**Border Token Split:** `--color-border` (`#E2E8F0`) is for cards, panels, table rows, and dividers only. Form controls — inputs, selects, textareas, checkboxes, radio buttons, and date pickers — use the darker `--color-input-border` (`#64748B`) so their edges remain clearly visible. Focus and error states override it: focus uses `--color-primary` and validation errors use `--color-destructive` with an inline message.

**Text Contrast Check (WCAG 2.1 AA):** Body text `#1F2937` on white is 14.68:1 and on `#F5F7FB` is 13.69:1. Muted text `#475569` on white is 7.58:1 and on `#F5F7FB` is 7.07:1. Primary blue `#4458E5` on white is 5.57:1 and on `#F5F7FB` is 5.19:1. White on primary blue is 5.57:1. All exceed the 4.5:1 normal-text target.

### Semantic Status Tokens

Base color, on-color, and light tint per semantic state. The on-color is the text/icon
color on the solid token; the tint is the badge background and is always paired with its
matching `-on-*-tint` text color. Every pairing below is verified at or above the WCAG
2.1 AA 4.5:1 text contrast ratio.

| Token | Hex | Contrast |
|---|---|---|
| `--color-success` | `#15803D` | White on it: 5.02:1 |
| `--color-on-success` | `#FFFFFF` | — |
| `--color-success-tint` | `#DCFCE7` | `#15803D` on it: 4.57:1 |
| `--color-warning` | `#B45309` | White on it: 5.02:1 |
| `--color-on-warning` | `#FFFFFF` | — |
| `--color-warning-tint` | `#FEF3C7` | `#B45309` on it: 4.51:1 |
| `--color-info` | `#1D4ED8` | White on it: 6.70:1 |
| `--color-on-info` | `#FFFFFF` | — |
| `--color-info-tint` | `#DBEAFE` | `#1D4ED8` on it: 5.50:1 |
| `--color-destructive` | `#DC2626` | White on it: 4.83:1 |
| `--color-on-destructive` | `#FFFFFF` | — |
| `--color-destructive-tint` | `#FEE2E2` | `#B91C1C` on it: 5.30:1 |
| `--color-on-destructive-tint` | `#B91C1C` | — |
| `--color-neutral-tint` | `--color-muted` (`#F1F4F9`) | `--color-muted-foreground` on it: 6.87:1 |

Do not use `--color-destructive` as badge text on a tint; it falls to 3.95:1. Badge text on
`--color-destructive-tint` uses `--color-on-destructive-tint`.

### Status Badge Mapping

One mapping, used by every list, detail page, report, badge, and PDF/print view. Status
names and values are identical to the API response.

| Document status | Badge background | Badge text | Token pair |
|---|---|---|---|
| DRAFT | `--color-muted` | `--color-muted-foreground` | neutral |
| CONFIRMED | `--color-info-tint` | `--color-info` | info |
| ISSUED | `--color-info-tint` | `--color-info` | info |
| PARTIALLY_RECEIVED | `--color-warning-tint` | `--color-warning` | warning |
| PARTIALLY_SHIPPED (P1) | `--color-warning-tint` | `--color-warning` | warning |
| PARTIALLY_PAID | `--color-warning-tint` | `--color-warning` | warning |
| RECEIVED | `--color-success-tint` | `--color-success` | success |
| SHIPPED | `--color-success-tint` | `--color-success` | success |
| PAID | `--color-success-tint` | `--color-success` | success |
| CANCELLED | `--color-destructive-tint` | `--color-on-destructive-tint` | destructive |
| VOID | `--color-destructive-tint` | `--color-on-destructive-tint` | destructive |

Reservation states (`ACTIVE`, `CONSUMED`, `RELEASED`) follow the same semantics:
ACTIVE = info, CONSUMED = success, RELEASED = neutral.

### Typography

- **Heading Font:** Fira Sans
- **Body Font:** Fira Sans
- **Monospace / Data Font:** Fira Code
- **Mood:** dashboard, data, analytics, operational, precise
- **Google Fonts:** [Fira Code + Fira Sans](https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```

**Font Usage Rules**

| Content | Font | Treatment |
|---|---|---|
| Headings, body, labels, buttons, help text, empty states | Fira Sans | Default for all UI text |
| SKU (e.g. `NXP-1001`) | Fira Code | Monospace, uppercase as stored |
| Document numbers — PO-, GR-, SO-, SH-, INV-, PAY- | Fira Code | Monospace; never letter-spaced or re-typed by the UI |
| Numeric table columns — quantities, unit prices, line and document totals, balances, paid amounts | Fira Code | `text-align: right` + `font-variant-numeric: tabular-nums` |
| Dates, times, timestamps | Fira Sans | Locale-formatted; digits keep tabular alignment in tables |

```css
/* UI text */
:root {
  --font-ui: "Fira Sans", system-ui, sans-serif;
  /* Identifiers and figures */
  --font-mono: "Fira Code", ui-monospace, monospace;
}

body,
input,
select,
textarea,
button {
  font-family: var(--font-ui);
}

.mono,
.doc-number,
.sku {
  font-family: var(--font-mono);
}

/* Numeric table column: right-aligned, tabular so digits line up row to row */
.numeric-cell {
  font-family: var(--font-mono);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

Tabular numerals are required on every numeric column so that quantities, prices, and
totals align vertically and a misread digit is visible at a glance. Never left-align a
numeric column and never render a monetary or decimal value as a float-derived string.

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Page section margins |
| `--space-3xl` | `64px` / `4rem` | Page top/bottom margins |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(15,23,42,0.04)` | Subtle lift |
| `--shadow-md` | `0 1px 3px rgba(15,23,42,0.06)` | Cards, buttons |
| `--shadow-lg` | `0 4px 12px rgba(15,23,42,0.08)` | Modals, dropdowns, top bar, sidebar |
| `--shadow-xl` | `0 12px 28px rgba(15,23,42,0.12)` | Dialogs, confirmation dialogs, drawers |

### Radii

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `8px` | Badges, tags, small supporting elements |
| `--radius-md` | `12px` | Buttons, inputs, dropdowns |
| `--radius-lg` | `16px` | Cards, modals, containers |
| `--radius-pill` | `999px` | Fully rounded / pill elements |

### Shell Geometry

| Token | Value | Usage |
|-------|-------|-------|
| `--shell-sidebar-width` | `256px` | Desktop sidebar width |
| `--shell-sidebar-compact-width` | `72px` | Narrow/icon-only sidebar |
| `--shell-topbar-height` | `64px` | Top bar height |
| `--sidebar-row-padding-block` | `4px` | Compact but readable sidebar entries |
| `--sidebar-group-gap` | `8px` | Space between sidebar groups |
| `--sidebar-list-gap` | `2px` | Space between sidebar entries |
| `--sidebar-scrollbar-width` | `5px` | Thin custom sidebar scrollbar |

The sidebar contains twelve entries. Keep its rows compact enough for all entries and
group headings to fit in a 700px-high viewport; when content exceeds the available height,
use a thin, low-contrast custom scrollbar without hiding the scroll affordance.

### Navigation

The sidebar renders this navigation list and nothing else. Two entries are available in v1; all others are marked `Soon`.

| Group | Entry | State |
|-------|-------|-------|
| General | Overview | available |
| General | Sales Orders | Soon |
| General | Inventory | Soon |
| General | Reports | Soon |
| Management | Products | Soon |
| Management | Customers & Suppliers | Soon |
| Management | Purchasing | Soon |
| Management | Invoicing | Soon |
| Management | Users & Roles | Soon |
| Settings | Organization | Soon |
| Settings | Audit Log | Soon |
| Settings | System Health | available |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: var(--color-card);
  color: var(--color-primary);
  border: 1px solid var(--color-border);
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
  transition: all 200ms ease;
}

.card.is-interactive {
  cursor: pointer;
}

.card.is-interactive:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

Cards, panels, table rows, and dividers use `--color-border`. A card is not a form
control, so it never uses `--color-input-border`. Drop `cursor: pointer` from static cards —
only interactive cards carry it.

### Inputs, Selects, Checkboxes

```css
.input,
.select,
.textarea,
.checkbox,
.radio {
  border: 1px solid var(--color-input-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-ui);
  transition: border-color 200ms ease;
}

.input,
.select {
  padding: 12px 16px;
  font-size: 16px;
}

.checkbox,
.radio {
  /* Checkboxes and radio buttons render as 20px controls with no padding.
     Their checked state uses --color-primary as the fill with
     --color-on-primary as the check mark. */
  width: 20px;
  height: 20px;
}

.input:focus-visible,
.select:focus-visible,
.textarea:focus-visible,
.checkbox:focus-visible,
.radio:focus-visible {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: 0 0 0 3px var(--color-ring);
}

/* Server validation failure */
.input[aria-invalid="true"],
.select[aria-invalid="true"] {
  border-color: var(--color-destructive);
}

/* Numbers entered by the user use the mono font and right alignment */
.input.numeric {
  font-family: var(--font-mono);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

Every form control has a visible `<label>` bound to its input id. Validation messages
render inline beneath the field, linked with `aria-describedby`, and announced to assistive
technology.

### Status Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* Neutral — DRAFT */
.badge--neutral {
  background: var(--color-muted);
  color: var(--color-muted-foreground);
}

/* Info — CONFIRMED, ISSUED, reservation ACTIVE */
.badge--info {
  background: var(--color-info-tint);
  color: var(--color-info);
}

/* Warning — PARTIALLY_RECEIVED, PARTIALLY_SHIPPED, PARTIALLY_PAID */
.badge--warning {
  background: var(--color-warning-tint);
  color: var(--color-warning);
}

/* Success — RECEIVED, SHIPPED, PAID, reservation CONSUMED */
.badge--success {
  background: var(--color-success-tint);
  color: var(--color-success);
}

/* Destructive — CANCELLED, VOID, reservation RELEASED */
.badge--destructive {
  background: var(--color-destructive-tint);
  color: var(--color-on-destructive-tint);
}
```

The badge text is the exact API status name (see Status Badge Mapping). The UI never
invents, abbreviates, or rewords a status, and colour is never the only signal — the
label carries the meaning.

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Data-Dense Dashboard

**Keywords:** Multiple charts/widgets, data tables, KPI cards, minimal padding, grid layout, space-efficient, maximum data visibility

**Best For:** Business intelligence dashboards, financial analytics, enterprise reporting, operational dashboards, data warehousing

**Key Effects:** Hover tooltips, chart zoom on click, row highlighting on hover, smooth filter animations, data loading spinners

### Page Pattern

**Pattern Name:** Authenticated App Shell

Every page inside the signed-in product uses this shell. There is no marketing or landing
page pattern in v1: no hero, no client logo wall, no Contact Sales section, no pricing
block, no mega menu.

- **Shell:** Persistent left sidebar navigation + top bar + content area, with dialogs
  layered above the content area.
- **Section Order:** Top bar (full width, top) > Sidebar (fixed left, full height) +
  Content area (page header > filters bar > data table or form) > Dialog layer.
- **Sidebar navigation:** Persistent and always visible; no hamburger substitution and no
  marketing links. Items are grouped by domain module — Sales, Inventory, Purchasing,
  Invoicing, Contacts, Products, Reports, Audit, Settings. Items the user's permissions do
  not cover are not rendered; the API rejects them with 403 regardless (a hidden control is
  usability, not security). The active item carries `--color-primary` plus
  `aria-current="page"`, and sidebar navigation is keyboard operable with a visible focus
  ring.
- **Top bar:** Organization switcher (switches the active tenant, revalidates membership and
  permissions, and never takes a tenant scope from the URL or query string) and user menu
  (name, email, roles, logout). The tenant name is always visible here so a user always
  knows which organization they are acting in.
- **Content area:** Page header carries the title, the record type or number, and the
  single primary action. The filters bar holds search, status filter, date-range filter, and
  a "Clear filters" action. The body is either a data table or a form — never both on one
  screen outside a dialog.
- **Dialogs:** Confirmation dialogs for destructive and irreversible actions (cancel, void,
  post shipment, issue invoice, reverse payment) state the consequence in plain language
  before the user commits, and use `--shadow-xl` over a dimmed overlay. Escape closes, and
  the confirm action takes focus on open.
- **Empty state:** A centred panel inside the content area that explains what the list
  contains and offers the primary create action. A report matching zero rows shows
  "No records match the selected filters." with a "Clear filters" action.
- **Printable output:** Invoice and document print views reuse the same status badges and
  typography rules, and always carry the "Operational invoice — not a tax invoice" label.

```css
.app-shell {
  display: grid;
  grid-template-areas:
    "topbar topbar"
    "sidebar content";
  grid-template-columns: 256px 1fr;
  grid-template-rows: 64px 1fr;
  height: 100vh;
  background: var(--color-background);
}

.app-shell__topbar {
  grid-area: topbar;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-lg);
}

.app-shell__sidebar {
  grid-area: sidebar;
  background: var(--color-card);
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
  padding: var(--space-md);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.app-shell__content {
  grid-area: content;
  overflow-y: auto;
  padding: var(--space-lg);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.filters-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: flex-end;
  padding: var(--space-md);
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-md);
}

/* Desktop >= 1024px: full sidebar. Tablet 768-1023px: compact icon sidebar;
   labels remain accessible and each entry has a tooltip. */
@media (max-width: 1023px) {
  .app-shell {
    grid-template-columns: var(--shell-sidebar-compact-width) 1fr;
  }
}
```

### Layout Targets (v1)

- **Light mode only.** v1 ships no dark theme, no theme switcher, and no `prefers-color-scheme`
  variant. Every token above is defined once as a light-mode value. Dark mode is a P2 item and
  requires a contrast re-verification of every token pair.
- **Desktop and tablet only.** Supported widths are 768px (tablet portrait) through 1440px
  and wider. Phone layouts are out of scope for v1; do not design a 375px breakpoint and do
  not add one later without a layout review.
- **Supported browsers:** Chrome 100+, Safari 15+, Firefox 100+, Edge (Chromium).

### UX Rules (PRD Section 7.3 — mandatory for every feature)

These are acceptance criteria for a feature, not polish. A feature that skips one of them
is not complete.

1. **Validation** — forms validate on blur and on submit using the same Zod schema as the
   API contract; errors display inline under the field; the server validation response is
   authoritative and maps to the same field errors.
2. **Loading state** — every data fetch shows a skeleton placeholder; every submit button
   shows a spinner and is disabled while the request is in flight; retries reuse the same
   `Idempotency-Key`.
3. **Error state** — field errors are inline; operation errors appear in a dismissible
   banner carrying the `requestId`; page-level failures show an error panel with a Retry
   action.
4. **Success feedback** — every create, update, post, or state transition shows a
   confirmation toast naming the record (for example "Sales order SO-000042 confirmed") and
   updates the visible status immediately.
5. **Destructive and irreversible actions** — cancel, void, post shipment, issue invoice, and
   reverse payment each require a confirmation dialog stating the consequence.
6. **Empty states** — explain what the list contains and offer the primary create action.
7. **Status display** — every document shows a status badge using the same status names as
   the API, following the Status Badge Mapping table.
8. **Tables** — server-side pagination, sortable columns, right-aligned tabular numeric
   columns, and a visible total count on every list. Default page size 25, maximum 100.

Accessibility (WCAG 2.1 AA) applies to all of the above: labeled fields, sufficient colour
contrast, visible focus, full keyboard operation, and accessible error messages.

---

## Anti-Patterns (Do NOT Use)

- ❌ Ornate design
- ❌ No filtering

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y
- ❌ **Marketing patterns in the product** — no hero, no client logo wall, no Contact Sales, no pricing page, no mega menu. v1 has one authenticated shell
- ❌ **Input controls using `--color-border`** — form controls use `--color-input-border`; only cards and dividers use `--color-border`
- ❌ **Status colour without a label** — colour alone never communicates status; the badge label is the API status name
- ❌ **Ad-hoc status colours** — never pick a badge colour outside the Status Badge Mapping table
- ❌ **Left-aligned numeric columns or proportional digits in tables** — right-align with tabular numerals and Fira Code
- ❌ **Redescribing document numbers** — render `PO-`, `GR-`, `SO-`, `SH-`, `INV-`, `PAY-` numbers verbatim in Fira Code
- ❌ **Dark mode or theme switching in v1** — light mode only until P2
- ❌ **Client-side tenant switching** — the organization switcher goes through the server, which revalidates membership

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode only; no dark theme or theme switcher in v1
- [ ] Text contrast 4.5:1 minimum — solid badges and tints both verified
- [ ] Form controls use `--color-input-border`; cards and dividers use `--color-border`
- [ ] Status badges follow the Status Badge Mapping table, with the API status name as the label
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 768px, 1024px, 1440px (desktop and tablet; no phone layout in v1)
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll at 768px, 1024px, or 1440px
- [ ] Skeleton loaders on every data fetch; submit buttons disabled with a spinner in flight
- [ ] Inline field errors; dismissible error banner carrying the `requestId`
- [ ] Success toast naming the affected record on every create, post, and transition
- [ ] Confirmation dialog on every destructive or irreversible action
- [ ] Tables server-side paginated, sortable, with a visible total count
- [ ] Numeric columns right-aligned, tabular numerals, Fira Code
- [ ] SKU and document numbers in Fira Code, rendered verbatim
- [ ] Empty states explain the list and offer the primary create action
- [ ] WCAG 2.1 AA: labels bound to inputs, keyboard operable, errors announced
