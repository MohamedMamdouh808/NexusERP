> The palette changed in the tuning pass; `frontend/src/styles/tokens.css` contains the current values.

# Contrast evidence

Required by FR-004 and FR-052 and asserted by SC-003: every text, border and focus pair this
direction introduces is **measured and recorded**, so the claim can be re-checked rather than
believed (spec.md "Contrast of every token pair is measured and written down rather than assumed").

## Method

Relative luminance and contrast ratio are computed with the WCAG 2.1 definitions, with no
rounding until the value is printed:

```
channel:  c = channel / 255
          c <= 0.03928  ?  c / 12.92  :  ((c + 0.055) / 1.055) ^ 2.4
luminance: L = 0.2126·R + 0.7152·G + 0.0722·B
ratio:    (L_lighter + 0.05) / (L_darker + 0.05)
```

Inputs are the hex values as transcribed into [tokens.css](file:///d:/web-projects/NexusERP/frontend/src/styles/tokens.css),
which is itself transcribed from [MASTER.md](file:///d:/web-projects/NexusERP/design-system/nexuserp/MASTER.md).
Both sides of each pair are token values, so a change to either token invalidates this table and
the report is re-measured with it.

**Requirements** (FR-004, WCAG 2.1 AA): text pairs ≥ **4.5:1**; border and focus pairs ≥ **3:1**.
Any pair below its requirement is **changed**, not accepted as an exception.

## Text pairs — requirement 4.5:1

| Pair | Context | Ratio | Result |
|---|---|---|---|
| `--color-foreground` `#1E3A8A` on `--color-card` `#FFFFFF` | body text on every card, panel and the top bar | **10.36:1** | PASS |
| `--color-foreground` `#1E3A8A` on `--color-background` `#F8FAFC` | body text on the page background | **9.90:1** | PASS |
| `--color-card-foreground` `#1E3A8A` on `--color-card` `#FFFFFF` | `.card` text | **10.36:1** | PASS |
| `--color-muted-foreground` `#475569` on `--color-card` `#FFFFFF` | page-header description, breadcrumb, sidebar group label | **7.58:1** | PASS |
| `--color-muted-foreground` `#475569` on `--color-background` `#F8FAFC` | secondary text on the page | **7.24:1** | PASS |
| `--color-primary` `#1E40AF` on `--color-card` `#FFFFFF` | secondary button label on a card | **8.72:1** | PASS |
| `--color-primary` `#1E40AF` on `--color-background` `#F8FAFC` | secondary button label on the page | **8.34:1** | PASS |
| `--color-on-primary` `#FFFFFF` on `--color-primary` `#1E40AF` | primary button label | **8.72:1** | PASS |
| `--color-on-destructive` `#FFFFFF` on `--color-destructive` `#DC2626` | danger button label | **4.83:1** | PASS |
| `--color-on-success` `#FFFFFF` on `--color-success` `#15803D` | solid success surface | **5.02:1** | PASS |
| `--color-on-warning` `#FFFFFF` on `--color-warning` `#B45309` | solid warning surface | **5.02:1** | PASS |
| `--color-on-info` `#FFFFFF` on `--color-info` `#1D4ED8` | solid info surface | **6.70:1** | PASS |

**The current entry against the active pill** (FR-004, and the figure quoted in MASTER.md rule 2):

| Pair | Context | Ratio | Result |
|---|---|---|---|
| `--color-primary` `#1E40AF` on `--color-info-tint` `#DBEAFE` | `.sidebar-nav__link[aria-current='page']` text | **7.15:1** | PASS |

**Text inside status pills against the pill background.** The direction has fourteen `BadgeStatus`
names (state-manifest.md) but five token pairs — every status maps to one of the five through
MASTER.md "Status Badge Mapping":

| Statuses | Pair | Ratio | Result |
|---|---|---|---|
| `DRAFT`, `RELEASED` | `--color-muted-foreground` `#475569` on `--color-neutral-tint` `#E9EEF6` | **6.50:1** | PASS |
| `CONFIRMED`, `ISSUED`, `ACTIVE` | `--color-info` `#1D4ED8` on `--color-info-tint` `#DBEAFE` | **5.49:1** | PASS |
| `PARTIALLY_RECEIVED`, `PARTIALLY_SHIPPED`, `PARTIALLY_PAID` | `--color-warning` `#B45309` on `--color-warning-tint` `#FEF3C7` | **4.51:1** | PASS |
| `RECEIVED`, `SHIPPED`, `PAID`, `CONSUMED` | `--color-success` `#15803D` on `--color-success-tint` `#DCFCE7` | **4.57:1** | PASS |
| `CANCELLED`, `VOID` | `--color-on-destructive-tint` `#B91C1C` on `--color-destructive-tint` `#FEE2E2` | **5.30:1** | PASS |

**Sidebar and pills, remainder:**

| Pair | Context | Ratio | Result |
|---|---|---|---|
| `--color-foreground` `#1E3A8A` on `--color-muted` `#E9EEF6` | sidebar entry hover background | **8.89:1** | PASS |
| `--color-muted-foreground` `#475569` on `--color-neutral-tint` `#E9EEF6` | the `Soon` label on its pill | **6.50:1** | PASS |

Covers the palette's every text-on-surface pair. The accent and secondary on-colours are not listed
because the shell has no consumer for them — see "Measured and not subject" below.

## Border and focus pairs — requirement 3:1

| Pair | Context | Ratio | Result |
|---|---|---|---|
| `--color-input-border` `#64748B` on `--color-card` `#FFFFFF` | input edge, `.button` edge, `.shell-placeholder` dashed edge | **4.76:1** | PASS |
| `--color-input-border` `#64748B` on `--color-background` `#F8FAFC` | input edge on the page | **4.55:1** | PASS |
| `--color-ring` `#1E40AF` on `--color-card` `#FFFFFF` | focus ring on a card | **8.72:1** | PASS |
| `--color-ring` `#1E40AF` on `--color-background` `#F8FAFC` | focus ring on the page | **8.34:1** | PASS |
| `--color-destructive` `#DC2626` on `--color-destructive-tint` `#FEE2E2` | error panel edge | **3.95:1** | PASS |

## Measured and not subject to the requirement

These are recorded so the table is not silently incomplete, and each is classified rather than
excused.

| Pair | Ratio | Why it is not a 3:1 pair |
|---|---|---|
| `--color-border` `#DBEAFE` on `--color-card` `#FFFFFF` | 1.22:1 | Purely decorative: card edges, panel edges, table row dividers. FR-004's border set is **input borders and focus rings**; WCAG 1.4.11 applies to components and to graphical objects *required to understand the content*, and a divider is neither. The token is pre-existing and the direction does not introduce it. |
| `--color-border` `#DBEAFE` on `--color-background` `#F8FAFC` | 1.17:1 | Same token, the top bar and sidebar edges. The same classification applies. |
| `--color-on-secondary` `#000000` on `--color-secondary` `#3B82F6` | 5.71:1 | Declared in `tokens.css` but no rule in `frontend/src` consumes either token, so the direction introduces no instance of this pair. It passes anyway. |
| `--color-on-accent` `#000000` on `--color-accent` `#D97706` | 6.59:1 | Same: declared, unconsumed. Passes anyway. |

## Corrections made

Three ratios stated in MASTER.md read 0.01:1 higher than the computed values. They were corrected
to the measured figures, so the design system and this report agree; **no token value changed** and
no result crossed its requirement — all three were and remain passes.

| In MASTER.md | Was | Computed |
|---|---|---|
| input border against `--color-background` | 4.56:1 | **4.55:1** |
| `--color-info-tint`: `#1D4ED8` on it | 5.50:1 | **5.49:1** |
| `--color-neutral-tint`: `--color-muted-foreground` on it | 6.51:1 | **6.50:1** |

## Result

**25 pairs are subject to FR-004's thresholds and every one passes. 0 pairs fail**, so no pair was
changed and no exception is being carried (SC-003). The 4 pairs above are measured and classified
out. The strictest in-scope margins are the warning pill at **4.51:1** (0.01:1 above the text bar)
and the error-panel edge at **3.95:1** (0.95:1 above the border bar) — a future change to
`--color-warning`, `--color-warning-tint`, `--color-destructive` or `--color-destructive-tint` must
re-measure those two pairs first.
