# Data Model: Frontend Design Foundation and Application Shell

This feature has **no database**. The "data model" is therefore the set of typed structures the
interface is built from: the design tokens, the navigation list, the component/state manifest,
the sample records, and the service interface's shapes. Each entity below names its fields, its
rules, and where it lives, and traces to the spec section that constrains it.

Source of authority: [spec.md](spec.md) `### Key Entities` and `## Requirements`.

---

## 1. Design token

A named design value, defined once in the design system and referenced rather than restated.

| Field | Type | Rule |
|---|---|---|
| `name` | CSS custom property (`--color-primary`, `--spacing-md`, …) | Tailwind 4 namespace names, so the theme bridge needs no renaming |
| `value` | colour / measure / shadow literal | The **only** place a raw value may appear in `frontend/src` |
| `source` | section of `design-system/nexuserp/MASTER.md` | Adding a token without amending the master file is a defect (FR-005) |

**Rules.** Every token in `frontend/src/styles/tokens.css` is transcribed from the master file.
No component carries a raw value (FR-003); `scripts/check-no-raw-design-values.ts` enforces it
and no exemption is added (FR-051). The token file is unchanged in shape by this feature except
for values the direction adds.

**States / transitions.** None. Tokens are constants.

---

## 2. Contrast record

One measured pair, kept so the claim can be re-checked.

| Field | Type | Rule |
|---|---|---|
| `pair` | e.g. `--color-on-primary` on `--color-primary` | One pair per row |
| `ratio` | number (`4.83:1`) | Computed, not estimated (FR-004) |
| `requirement` | `4.5:1` (text) or `3:1` (border/focus) | Every pair must meet it |
| `result` | pass / fail | A failing pair is changed, never accepted as an exception (FR-004) |

**Live location.** `specs/004-frontend-shell/evidence/contrast-report.md` (FR-052, SC-003).

---

## 3. Navigation entry

One destination in the sidebar.

| Field | Type | Rule |
|---|---|---|
| `group` | `'General' \| 'Management' \| 'Settings'` | Exactly one group per entry (FR-006) |
| `label` | string | Verbatim from the navigation table (FR-064) |
| `path` | string \| `null` | Present only when `state` is `available` |
| `state` | `'available' \| 'Soon'` | `Soon` entries carry a reason and cannot be activated (FR-007) |
| `reason` | string \| `null` | Required when `state` is `Soon`; also carries the tooltip text |
| `permission` | string \| `null` | **Recorded intent only** — nothing is filtered or guarded on the client (FR-015, Principle II) |

**Rules.** The order of entries in the list is the order of rows in the navigation table
(FR-064). Exactly two entries are `available` — Overview and System Health; every group holds at
least one entry (FR-067). Omitted surfaces (Billing & Subscription, Integrations, Upgrade Plan,
Help & Support, global search, notifications) do not exist in the model at all, not even as
`Soon` (FR-067, FR-016).

**Live location.** `frontend/src/components/shell/navigation.ts` — the typed `NAVIGATION` list,
mirrored by the master file's plain table and compared by one test (FR-065, contract:
[contracts/navigation-list.md](contracts/navigation-list.md)).

---

## 4. Navigation list

The one typed list the shell renders and the tests assert against, and its relationship to the
master file's table.

| Field | Type | Rule |
|---|---|---|
| `groups` | ordered `{ name, entries }[]` | Order is authoritative (FR-064) |
| `entries[].state` | `'available' \| 'Soon'` | Compared against the master file row-for-row (FR-065) |

**State transitions.** A later feature that makes a module available flips its entry from
`Soon` to `available` in the navigation list **and** the master file in the same change, and the
sidebar's tests must pass (FR-066).

---

## 5. Component state

One declared appearance or behaviour of a component.

| Field | Type | Rule |
|---|---|---|
| `component` | one of the components in the state matrix | ~12 components |
| `state` | a member of that component's state union | ~63 states in total |
| `verifiedBy` | `'unit test' \| 'gallery' \| 'unit test + gallery'` | Every state names how it is verified |

**Rules.** Every component in [spec.md](spec.md) FR-019 has at least one state; each state has a
gallery fixture *and* a test that asserts something specific to that state — an attribute,
class, role or accessible value — not merely that the component rendered (FR-050, SC-001).
Pseudo-class states (`hover`, `active`) are verified by gallery review **plus** a test that the
token-based class or attribute is applied, because the jsdom test environment does not compute
`:hover` (state matrix note).

**Full matrix.** The `Component × State × Verified by` table in [spec.md](spec.md)
`### Functional Requirements` is the authority (FR-062). Machine-readable twin:
`frontend/src/dev/gallery/state-manifest.ts`.

---

## 6. State manifest

The machine-readable list of the same components and states as the matrix.

| Field | Type | Rule |
|---|---|---|
| component key | `Record` key | Adding a component to the key union without a fixture fails type checking |
| state key | `Record` keyed by that component's state union | Adding/removing a state without a fixture and a test fails type checking (FR-059) |
| value | fixture reference + assertion marker | Read by the guard (FR-061) and by the SC-001/SC-011 computations (FR-060) |

**Rules.** The manifest is a **development-time artifact**: it must not reach a production
build and must not import sample data into a component (FR-063). It lives under
`frontend/src/dev/gallery/`, which the build excludes (R-005).

**Contract.** [contracts/state-manifest.md](contracts/state-manifest.md).

---

## 7. Sample record

A value that stands in for a real record so the interface can be reviewed.

| Field | Type | Rule |
|---|---|---|
| `id` | string | Stable within a session |
| `…domain fields…` | typed from `@nexuserp/shared` where a contract exists | FR-038 |
| money fields | **decimal string** (`'1250.00'`), never a number | FR-039, Principle IV |
| status | one of the API status names | Rendered through the badge mapping with the API's own names (FR-022) |

**Rules.** Sample data lives only in `frontend/src/mocks/sample-data.ts` and reaches components
only through the service interface (FR-036). It is never sent anywhere and never presented as a
real organization's data (FR-041). Every surface showing it carries the "Sample data" marker —
the top bar's sample organization and preview user, and the gallery; **no product page renders
sample records** (FR-040, SC-009).

**Lifecycle.** In-memory only. A gallery mutation changes the module-scoped store and nothing
else; there is no browser storage of any kind, and a reload restores the initial state
(FR-068). No state is `posted`, `issued` or otherwise immutable, because no business record
exists here (Principle III).

---

## 8. Service interface

The seam through which the interface obtains its data, shaped like the calls the real client
will make.

| Operation | Shape | Notes |
|---|---|---|
| list | `(query) => Promise<{ items: T[]; total: number }>` | Async, paginated, sortable (FR-037, FR-025) |
| detail | `(id) => Promise<T>` | One record |
| mutation | `(input) => Promise<Result>` | Returns a result; **never** presents a committed record (FR-037) |
| switches | `simulateFailure`, `simulateSlowResponse` | Sample-implementation only; make a call reject or delay (FR-069) |
| call log | recorded calls | Read by the every-enabled-control guard (FR-071) |

**Rules.** All operations are asynchronous and in-memory (FR-037). Types come from
`@nexuserp/shared` where a contract exists (FR-038). The real client implements the same
interface later with no component change (FR-036).

**Contract.** [contracts/service-interface.md](contracts/service-interface.md).

**Live location.** `frontend/src/services/catalog-service.ts` (interface),
`frontend/src/services/sample-catalog-service.ts` (sample implementation).

---

## 9. Request identifier

The identifier a failure carries, shown by an error state so a failure can be traced.

| Field | Type | Rule |
|---|---|---|
| `requestId` | string | Rendered by the error state; labelled as sample in the gallery (edge case) |

**Rules.** Reuses the existing `ApiFailure` shape and `fallbackFailure` helper in
`src/lib/api-client.ts`; 429 detection reuses `isRateLimited` (`status === 429 ||
code === TOO_MANY_REQUESTS`) and honours `Retry-After` (FR-033, R-007).

---

## 10. Icon library

The single permissively licensed dependency that supplies the interface's glyphs.

| Field | Type | Rule |
|---|---|---|
| `library` | one package (`lucide-react`) | One library only (FR-055) |
| `import` | per-icon named import | Only icons in use reach a build (FR-055, SC-013) |
| `size` / `colour` | from design tokens | No raw value; guard keeps passing (FR-055) |
| `licence` | recorded in third-party notices | FR-057 |

**Rules.** Decorative icons are `aria-hidden`; every icon-only control has an accessible name
**and** a tooltip (FR-056). The plan reports the measured bundle-size change (FR-058,
SC-013; recorded with R-001/R-012).

---

## 11. Demonstration switch

A labelled gallery control that changes what the sample implementation does.

| Field | Type | Rule |
|---|---|---|
| `label` | `'Simulate failure' \| 'Simulate slow response'` | Labelled in the gallery (FR-069) |
| `effect` | reject / delay | Affects the sample implementation only |
| `persisted` | `false` | No browser storage; reload resets (FR-068) |

**Rules.** With a switch on, the loading state, the error state with its `requestId`, and the
simulated 429 handling are reached as **real flows**, not static snapshots (FR-069, SC-018).
The switch's effect is confined to the gallery's in-memory sample implementation and does not
reach the shell or a production build (edge case).

---

## 12. Evidence artifacts

Recorded observations the feature owes, kept in the repository so each can be re-run.

| Artifact | Contents | Requirement |
|---|---|---|
| Contrast report | One row per pair, ratio, requirement, result | FR-004, FR-052, SC-003 |
| Keyboard walk-through | Each interactive element and the result of operating it from the keyboard | FR-045, FR-053, SC-004 |
| Deliberate-failure observations | Design-value guard, state-manifest guard, navigation comparison, every-control guard — each shown failing then passing | FR-051, FR-061, FR-065, FR-071 |
| Bundle-size delta | Before/after JS, CSS and font-asset sizes | FR-058, SC-013 |

---

## Relationships

```text
design-system/nexuserp/MASTER.md
        │  (amended first; single source of truth)
        ├──► design tokens ──► tokens.css ──► every component
        └──► navigation table ◄──compared──► navigation.ts ──► sidebar

spec.md state matrix ──is the authority for──► state-manifest.ts
                                                     │ typed against
                                        ┌────────────┴────────────┐
                                        ▼                         ▼
                                  gallery fixtures          state tests

sample-data.ts ──► sample-catalog-service.ts ──implements──► catalog-service.ts
                                                     │ used by
                                                     ▼
                                            components (never the data)
```
