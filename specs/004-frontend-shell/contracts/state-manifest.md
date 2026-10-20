# Contract: State manifest

The machine-readable twin of the state matrix in [spec.md](../spec.md). The matrix is the
authority; the manifest is the checked twin that the fixtures and the state tests are typed
against (spec FR-059, FR-062).

Live location: `frontend/src/dev/gallery/state-manifest.ts` (development-time artifact; must
not reach a production build — FR-063).

## Shape

Because both levels are `Record<Union, …>` rather than arrays, **TypeScript fails the build**
when a component or a state is added to the union without a matching entry.

```ts
export const COMPONENTS = [
  'Button', 'Input', 'Select', 'Textarea', 'Checkbox', 'Badge', 'Card',
  'DataTable', 'Dialog', 'ConfirmDialog', 'DropdownMenu', 'Toast',
  'Skeleton', 'EmptyState', 'ErrorState',
] as const;
export type ComponentName = (typeof COMPONENTS)[number];

export const BUTTON_STATES = ['default', 'hover', 'focus-visible', 'active', 'loading', 'disabled'] as const;
export type ButtonState = (typeof BUTTON_STATES)[number];

/** Badge is keyed by status name, so each of the matrix's fourteen names is one state. */
export const BADGE_STATUSES = [
  'DRAFT', 'CONFIRMED', 'ISSUED', 'PARTIALLY_RECEIVED', 'PARTIALLY_SHIPPED',
  'PARTIALLY_PAID', 'RECEIVED', 'SHIPPED', 'PAID', 'CANCELLED', 'VOID',
  'ACTIVE', 'CONSUMED', 'RELEASED',
] as const;
export type BadgeStatus = (typeof BADGE_STATUSES)[number];
// … one state union per component, exactly as the matrix lists …

export interface StateEntry<F> {
  /** Renders this state; used by the gallery and by the usages list. */
  readonly fixture: F;
  /** The assertion this state's test makes — an attribute, class, role or aria value. */
  readonly assertion: string;
}

export const STATE_MANIFEST: {
  readonly Button: Record<ButtonState, StateEntry<ButtonFixture>>;
  readonly Badge: Record<BadgeStatus, StateEntry<BadgeFixture>>;
  // … one entry per component, keyed by that component's state union …
} = { /* … */ };
```

## Rules

1. **Exhaustive.** Every component and state in the matrix has exactly one manifest entry; the
   `Record` types make a missing entry a type error (FR-059). Badge is keyed by `BadgeStatus`, so
   each of its fourteen status names counts as a state rather than as one open-ended row.
2. **Specific assertions.** Each `assertion` names something specific to the state (an
   attribute, class, role or aria value) and must not be satisfiable by the component merely
   rendering (FR-050).
3. **Pseudo-classes.** `hover` and `active` record that they are verified by gallery review
   plus a test that the token-based class or attribute is applied, because the jsdom test DOM
   does not compute `:hover` (matrix note).
4. **Development-only.** The manifest is imported by the gallery and by tests only; a check
   fails if any production module imports it (FR-063), and the build-output check confirms it
   is absent from `dist/` (FR-070).
5. **Counts.** SC-001 and SC-011 are computed from this manifest, never counted by hand
   (FR-060).

## Verification

- `state-manifest.guard.spec.ts` reads the manifest and fails when an entry has no fixture or no
  assertion; it is shown failing on purpose, then passing (FR-061, SC-014).
- A test compares the manifest's component/state set with the matrix in `spec.md`; a divergence
  is a failure (FR-062).
