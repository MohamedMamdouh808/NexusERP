/**
 * The state manifest (T017) - the machine-readable twin of the state matrix in
 * `specs/004-frontend-shell/spec.md`.
 *
 * The matrix is the authority; this file is the checked twin (FR-059, FR-062).
 * Both levels are `Record`s rather than arrays, so **TypeScript fails the build**
 * when a component or a state is added to a union without a matching entry. That
 * is the whole point: a state that is listed but not built, or built but not
 * listed, is a compile error rather than something a reviewer has to notice.
 *
 * What lives here is the *shape* of the review: which states exist, which fixture
 * renders each one, and what the test for that state asserts. The fixtures
 * themselves arrive with T055 and are typed against this file, so a state with no
 * fixture does not build; `state-manifest.guard.spec.ts` (T046) additionally
 * fails at runtime when an entry's fixture or assertion is blank (FR-061), and
 * `state-manifest-matrix.spec.ts` (T047) compares these sets with the matrix and
 * computes the SC-001 and SC-011 counts from them rather than counting by hand
 * (FR-060).
 *
 * This module is a development-time artifact (FR-063): it imports nothing, it is
 * imported only by the gallery and by tests, and `check-no-gallery-in-build.ts`
 * confirms it is absent from `dist/`.
 */

/** Every component FR-019 names, in the matrix's order. */
export const COMPONENTS = [
  'Button',
  'Input',
  'Select',
  'Textarea',
  'Checkbox',
  'Badge',
  'Card',
  'DataTable',
  'Dialog',
  'ConfirmDialog',
  'DropdownMenu',
  'Toast',
  'Skeleton',
  'EmptyState',
  'ErrorState',
] as const;

export type ComponentName = (typeof COMPONENTS)[number];

/** The state unions, one per component, exactly as the matrix lists them. */

export const BUTTON_STATES = [
  'default',
  'hover',
  'focus-visible',
  'active',
  'loading',
  'disabled',
] as const;
export type ButtonState = (typeof BUTTON_STATES)[number];

export const INPUT_STATES = [
  'default',
  'focus-visible',
  'filled',
  'required',
  'with-help-text',
  'invalid',
  'disabled',
] as const;
export type InputState = (typeof INPUT_STATES)[number];

export const SELECT_STATES = [
  'default',
  'focus-visible',
  'selected-value',
  'required',
  'with-help-text',
  'invalid',
  'disabled',
] as const;
export type SelectState = (typeof SELECT_STATES)[number];

export const TEXTAREA_STATES = INPUT_STATES;
export type TextareaState = (typeof TEXTAREA_STATES)[number];

export const CHECKBOX_STATES = [
  'unchecked',
  'checked',
  'focus-visible',
  'required',
  'invalid',
  'disabled',
] as const;
export type CheckboxState = (typeof CHECKBOX_STATES)[number];

/**
 * Badge is keyed by status name, so each of the design system's fourteen names
 * counts as one state rather than as a single open-ended row (FR-059, FR-060).
 * The set is the status mapping as it stands, including its P1-marked
 * `PARTIALLY_SHIPPED`, because FR-022 renders a name from that mapping verbatim.
 */
export const BADGE_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'ISSUED',
  'PARTIALLY_RECEIVED',
  'PARTIALLY_SHIPPED',
  'PARTIALLY_PAID',
  'RECEIVED',
  'SHIPPED',
  'PAID',
  'CANCELLED',
  'VOID',
  'ACTIVE',
  'CONSUMED',
  'RELEASED',
] as const;
export type BadgeStatus = (typeof BADGE_STATUSES)[number];

/** The matrix's fifteenth Badge row: the status must survive without colour. */
export const BADGE_NON_COLOUR_STATE = 'conveys-more-than-colour' as const;

export const BADGE_STATES = [...BADGE_STATUSES, BADGE_NON_COLOUR_STATE] as const;
export type BadgeState = (typeof BADGE_STATES)[number];

export const CARD_STATES = ['title-only', 'with-description', 'with-actions'] as const;
export type CardState = (typeof CARD_STATES)[number];

export const DATA_TABLE_STATES = [
  'default',
  'loading',
  'empty',
  'sorted-ascending',
  'sorted-descending',
  'page-after-the-first',
] as const;
export type DataTableState = (typeof DATA_TABLE_STATES)[number];

export const DIALOG_STATES = ['closed', 'open'] as const;
export type DialogState = (typeof DIALOG_STATES)[number];

export const CONFIRM_DIALOG_STATES = [
  'open-non-destructive',
  'open-destructive',
  'confirming',
] as const;
export type ConfirmDialogState = (typeof CONFIRM_DIALOG_STATES)[number];

export const DROPDOWN_MENU_STATES = ['closed', 'open', 'entry-unavailable'] as const;
export type DropdownMenuState = (typeof DROPDOWN_MENU_STATES)[number];

export const TOAST_STATES = ['success', 'failure', 'informational', 'dismissed'] as const;
export type ToastState = (typeof TOAST_STATES)[number];

export const SKELETON_STATES = ['default', 'reduced-motion'] as const;
export type SkeletonState = (typeof SKELETON_STATES)[number];

export const EMPTY_STATE_STATES = ['with-create-action', 'without-create-action'] as const;
export type EmptyStateState = (typeof EMPTY_STATE_STATES)[number];

export const ERROR_STATE_STATES = ['retryable', 'not-retryable'] as const;
export type ErrorStateState = (typeof ERROR_STATE_STATES)[number];

/** The state union belonging to each component. The bridge from name to states. */
export interface ComponentStates {
  readonly Button: ButtonState;
  readonly Input: InputState;
  readonly Select: SelectState;
  readonly Textarea: TextareaState;
  readonly Checkbox: CheckboxState;
  readonly Badge: BadgeState;
  readonly Card: CardState;
  readonly DataTable: DataTableState;
  readonly Dialog: DialogState;
  readonly ConfirmDialog: ConfirmDialogState;
  readonly DropdownMenu: DropdownMenuState;
  readonly Toast: ToastState;
  readonly Skeleton: SkeletonState;
  readonly EmptyState: EmptyStateState;
  readonly ErrorState: ErrorStateState;
}

export type StateOf<C extends ComponentName> = ComponentStates[C];

/**
 * The name of the fixture that renders one state, e.g. `'Button.default'`.
 *
 * A template-literal union rather than `string`, so a mistyped slot is a compile
 * error here rather than a fixture that silently never renders. `FixtureSlotOf`
 * is the per-component form: `FixtureSlotOf<'Button'>` is the contract's
 * `ButtonFixture` name set, and T055's `fixtures.ts` is a record over it, which
 * is what makes a missing fixture a type error (FR-059).
 */
export type FixtureSlotOf<C extends ComponentName> = `${C}.${StateOf<C>}`;
export type FixtureSlot = { [C in ComponentName]: FixtureSlotOf<C> }[ComponentName];

export interface StateEntry<F extends FixtureSlot = FixtureSlot> {
  /** Renders this state; used by the gallery and by the usages list. */
  readonly fixture: F;
  /**
   * The assertion this state's test makes - an attribute, class, role or aria
   * value specific to the state. It must not be satisfiable by the component
   * merely rendering (FR-050).
   */
  readonly assertion: string;
}

/**
 * A pseudo-class the test DOM cannot compute. The matrix verifies `hover` and
 * `active` by gallery review plus a test asserting the token-backed class or
 * attribute that carries the appearance is applied (matrix note, contract rule 3).
 */
const APPLIED_CLASS = 'the applied-class test asserts the token-backed class carrying this appearance is on the element (jsdom does not compute the pseudo-class); the gallery reviews the appearance itself';

const BUTTON: Record<ButtonState, StateEntry> = {
  default: {
    fixture: 'Button.default',
    assertion: "the control has role 'button' with an accessible name and data-state='default'",
  },
  hover: {
    fixture: 'Button.hover',
    assertion: APPLIED_CLASS,
  },
  'focus-visible': {
    fixture: 'Button.focus-visible',
    assertion:
      "data-state='focus-visible' and the token-backed focus ring class is applied to the element",
  },
  active: {
    fixture: 'Button.active',
    assertion: APPLIED_CLASS,
  },
  loading: {
    fixture: 'Button.loading',
    assertion:
      "aria-busy='true', the accessible name is unchanged, and the control does not submit while loading",
  },
  disabled: {
    fixture: 'Button.disabled',
    assertion: 'the disabled attribute is present and the control is not focusable',
  },
};

const INPUT: Record<InputState, StateEntry> = {
  default: {
    fixture: 'Input.default',
    assertion:
      "the control has role 'textbox' and a label associated through for/id, and carries no aria-invalid",
  },
  'focus-visible': {
    fixture: 'Input.focus-visible',
    assertion: 'the token-backed focus ring class is applied to the input element',
  },
  filled: {
    fixture: 'Input.filled',
    assertion: "the control's value is the filled value, not an empty string",
  },
  required: {
    fixture: 'Input.required',
    assertion: 'the required attribute is present (or aria-required is true)',
  },
  'with-help-text': {
    fixture: 'Input.with-help-text',
    assertion: "aria-describedby names the help text element's id",
  },
  invalid: {
    fixture: 'Input.invalid',
    assertion:
      "aria-invalid='true' and aria-describedby names the inline error element's id",
  },
  disabled: {
    fixture: 'Input.disabled',
    assertion: 'the disabled attribute is present',
  },
};

const SELECT: Record<SelectState, StateEntry> = {
  default: {
    fixture: 'Select.default',
    assertion:
      "the control has role 'combobox' and a label associated through for/id, and shows its placeholder option",
  },
  'focus-visible': {
    fixture: 'Select.focus-visible',
    assertion: 'the token-backed focus ring class is applied to the select element',
  },
  'selected-value': {
    fixture: 'Select.selected-value',
    assertion: "the control's value is the chosen option rather than the placeholder",
  },
  required: {
    fixture: 'Select.required',
    assertion: 'the required attribute is present (or aria-required is true)',
  },
  'with-help-text': {
    fixture: 'Select.with-help-text',
    assertion: "aria-describedby names the help text element's id",
  },
  invalid: {
    fixture: 'Select.invalid',
    assertion:
      "aria-invalid='true' and aria-describedby names the inline error element's id",
  },
  disabled: {
    fixture: 'Select.disabled',
    assertion: 'the disabled attribute is present',
  },
};

const TEXTAREA: Record<TextareaState, StateEntry> = {
  default: {
    fixture: 'Textarea.default',
    assertion:
      "the control has role 'textbox' and a label associated through for/id, and carries no aria-invalid",
  },
  'focus-visible': {
    fixture: 'Textarea.focus-visible',
    assertion: 'the token-backed focus ring class is applied to the textarea element',
  },
  filled: {
    fixture: 'Textarea.filled',
    assertion: "the control's value is the filled value, not an empty string",
  },
  required: {
    fixture: 'Textarea.required',
    assertion: 'the required attribute is present (or aria-required is true)',
  },
  'with-help-text': {
    fixture: 'Textarea.with-help-text',
    assertion: "aria-describedby names the help text element's id",
  },
  invalid: {
    fixture: 'Textarea.invalid',
    assertion:
      "aria-invalid='true' and aria-describedby names the inline error element's id",
  },
  disabled: {
    fixture: 'Textarea.disabled',
    assertion: 'the disabled attribute is present',
  },
};

const CHECKBOX: Record<CheckboxState, StateEntry> = {
  unchecked: {
    fixture: 'Checkbox.unchecked',
    assertion: "the control has role 'checkbox' with aria-checked='false'",
  },
  checked: {
    fixture: 'Checkbox.checked',
    assertion: "the control has role 'checkbox' with aria-checked='true'",
  },
  'focus-visible': {
    fixture: 'Checkbox.focus-visible',
    assertion: 'the token-backed focus ring class is applied to the checkbox element',
  },
  required: {
    fixture: 'Checkbox.required',
    assertion: 'the required attribute is present (or aria-required is true)',
  },
  invalid: {
    fixture: 'Checkbox.invalid',
    assertion:
      "aria-invalid='true' and aria-describedby names the inline error element's id",
  },
  disabled: {
    fixture: 'Checkbox.disabled',
    assertion: 'the disabled attribute is present',
  },
};

/**
 * One entry per status name, plus the row that carries the requirement that the
 * status survives without colour (FR-044).
 */
const BADGE: Record<BadgeState, StateEntry> = {
  DRAFT: {
    fixture: 'Badge.DRAFT',
    assertion: "the visible text is 'DRAFT' verbatim and data-tone is the tone the status mapping assigns",
  },
  CONFIRMED: {
    fixture: 'Badge.CONFIRMED',
    assertion: "the visible text is 'CONFIRMED' verbatim and data-tone is the tone the status mapping assigns",
  },
  ISSUED: {
    fixture: 'Badge.ISSUED',
    assertion: "the visible text is 'ISSUED' verbatim and data-tone is the tone the status mapping assigns",
  },
  PARTIALLY_RECEIVED: {
    fixture: 'Badge.PARTIALLY_RECEIVED',
    assertion: "the visible text is 'PARTIALLY_RECEIVED' verbatim and data-tone is the tone the status mapping assigns",
  },
  PARTIALLY_SHIPPED: {
    fixture: 'Badge.PARTIALLY_SHIPPED',
    assertion: "the visible text is 'PARTIALLY_SHIPPED' verbatim and data-tone is the tone the status mapping assigns",
  },
  PARTIALLY_PAID: {
    fixture: 'Badge.PARTIALLY_PAID',
    assertion: "the visible text is 'PARTIALLY_PAID' verbatim and data-tone is the tone the status mapping assigns",
  },
  RECEIVED: {
    fixture: 'Badge.RECEIVED',
    assertion: "the visible text is 'RECEIVED' verbatim and data-tone is the tone the status mapping assigns",
  },
  SHIPPED: {
    fixture: 'Badge.SHIPPED',
    assertion: "the visible text is 'SHIPPED' verbatim and data-tone is the tone the status mapping assigns",
  },
  PAID: {
    fixture: 'Badge.PAID',
    assertion: "the visible text is 'PAID' verbatim and data-tone is the tone the status mapping assigns",
  },
  CANCELLED: {
    fixture: 'Badge.CANCELLED',
    assertion: "the visible text is 'CANCELLED' verbatim and data-tone is the tone the status mapping assigns",
  },
  VOID: {
    fixture: 'Badge.VOID',
    assertion: "the visible text is 'VOID' verbatim and data-tone is the tone the status mapping assigns",
  },
  ACTIVE: {
    fixture: 'Badge.ACTIVE',
    assertion: "the visible text is 'ACTIVE' verbatim and data-tone is the tone the status mapping assigns",
  },
  CONSUMED: {
    fixture: 'Badge.CONSUMED',
    assertion: "the visible text is 'CONSUMED' verbatim and data-tone is the tone the status mapping assigns",
  },
  RELEASED: {
    fixture: 'Badge.RELEASED',
    assertion: "the visible text is 'RELEASED' verbatim and data-tone is the tone the status mapping assigns",
  },
  'conveys-more-than-colour': {
    fixture: 'Badge.conveys-more-than-colour',
    assertion:
      'the status name is present as text (not colour alone), so the badge is understandable with colour removed',
  },
};

const CARD: Record<CardState, StateEntry> = {
  'title-only': {
    fixture: 'Card.title-only',
    assertion: 'the title is the card\'s accessible heading and neither a description nor an actions region is rendered',
  },
  'with-description': {
    fixture: 'Card.with-description',
    assertion: 'a description element is rendered and is associated with the title',
  },
  'with-actions': {
    fixture: 'Card.with-actions',
    assertion: 'the actions region renders its controls with accessible names',
  },
};

const DATA_TABLE: Record<DataTableState, StateEntry> = {
  default: {
    fixture: 'DataTable.default',
    assertion: "the table has role 'table' and every column header is a columnheader",
  },
  loading: {
    fixture: 'DataTable.loading',
    assertion: "the table carries aria-busy='true' and renders skeleton rows instead of data rows",
  },
  empty: {
    fixture: 'DataTable.empty',
    assertion: 'the empty state is rendered and no data row is present',
  },
  'sorted-ascending': {
    fixture: 'DataTable.sorted-ascending',
    assertion: "the sorted column header carries aria-sort='ascending'",
  },
  'sorted-descending': {
    fixture: 'DataTable.sorted-descending',
    assertion: "the sorted column header carries aria-sort='descending'",
  },
  'page-after-the-first': {
    fixture: 'DataTable.page-after-the-first',
    assertion: 'the pager reports the current page and the total taken from the list response, not from the page length',
  },
};

const DIALOG: Record<DialogState, StateEntry> = {
  closed: {
    fixture: 'Dialog.closed',
    assertion: "no element with role 'dialog' is present in the document",
  },
  open: {
    fixture: 'Dialog.open',
    assertion:
      "role='dialog' with aria-modal='true', an accessible name, and focus inside the dialog",
  },
};

const CONFIRM_DIALOG: Record<ConfirmDialogState, StateEntry> = {
  'open-non-destructive': {
    fixture: 'ConfirmDialog.open-non-destructive',
    assertion:
      "role='alertdialog' is present and the confirm control does not carry the destructive variant",
  },
  'open-destructive': {
    fixture: 'ConfirmDialog.open-destructive',
    assertion:
      "role='alertdialog' is present and the confirm control carries the destructive variant",
  },
  confirming: {
    fixture: 'ConfirmDialog.confirming',
    assertion: 'the confirm control reports it is busy and cannot be activated a second time',
  },
};

const DROPDOWN_MENU: Record<DropdownMenuState, StateEntry> = {
  closed: {
    fixture: 'DropdownMenu.closed',
    assertion: "the trigger carries aria-expanded='false' and no listbox is rendered",
  },
  open: {
    fixture: 'DropdownMenu.open',
    assertion:
      "the trigger carries aria-expanded='true' and the open menu renders its entries",
  },
  'entry-unavailable': {
    fixture: 'DropdownMenu.entry-unavailable',
    assertion:
      "the unavailable entry carries aria-disabled='true' and exposes the reason it is unavailable",
  },
};

const TOAST: Record<ToastState, StateEntry> = {
  success: {
    fixture: 'Toast.success',
    assertion: "role='status' is present and the toast text is in the document",
  },
  failure: {
    fixture: 'Toast.failure',
    assertion: "role='alert' is present and the toast text is in the document",
  },
  informational: {
    fixture: 'Toast.informational',
    assertion: "role='status' is present and the toast text is in the document",
  },
  dismissed: {
    fixture: 'Toast.dismissed',
    assertion: 'no toast element remains in the document',
  },
};

const SKELETON: Record<SkeletonState, StateEntry> = {
  default: {
    fixture: 'Skeleton.default',
    assertion:
      "the element is aria-hidden='true' - it carries no information a reader needs - and the token-backed shimmer class is applied",
  },
  'reduced-motion': {
    fixture: 'Skeleton.reduced-motion',
    assertion:
      'the token-backed no-motion class is applied, and with prefers-reduced-motion: reduce no animation runs',
  },
};

const EMPTY_STATE: Record<EmptyStateState, StateEntry> = {
  'with-create-action': {
    fixture: 'EmptyState.with-create-action',
    assertion: 'the primary create control is rendered, enabled, and has an accessible name',
  },
  'without-create-action': {
    fixture: 'EmptyState.without-create-action',
    assertion: 'no primary create control is rendered, and the explanation is still present',
  },
};

const ERROR_STATE: Record<ErrorStateState, StateEntry> = {
  retryable: {
    fixture: 'ErrorState.retryable',
    assertion:
      'a retry control is rendered and enabled, and the failure request identifier is shown so it can be quoted',
  },
  'not-retryable': {
    fixture: 'ErrorState.not-retryable',
    assertion:
      'no retry control is rendered, and the failure message and request identifier are shown',
  },
};

/**
 * Every component and every state the matrix declares, keyed by both. The type
 * is written as a mapped type over `ComponentName` so the compiler enforces that
 * all fifteen components are present and each holds all of its own states.
 */
export const STATE_MANIFEST: {
  readonly [C in ComponentName]: Record<StateOf<C>, StateEntry>;
} = {
  Button: BUTTON,
  Input: INPUT,
  Select: SELECT,
  Textarea: TEXTAREA,
  Checkbox: CHECKBOX,
  Badge: BADGE,
  Card: CARD,
  DataTable: DATA_TABLE,
  Dialog: DIALOG,
  ConfirmDialog: CONFIRM_DIALOG,
  DropdownMenu: DROPDOWN_MENU,
  Toast: TOAST,
  Skeleton: SKELETON,
  EmptyState: EMPTY_STATE,
  ErrorState: ERROR_STATE,
};

/** Every state in the manifest, as a flat list. */
export function allStates(): readonly { component: ComponentName; state: string; entry: StateEntry }[] {
  return COMPONENTS.flatMap((component) =>
    Object.entries(STATE_MANIFEST[component]).map(([state, entry]) => ({ component, state, entry })),
  );
}

/**
 * The number of states the manifest declares. Computed here rather than written
 * down, so SC-001 and SC-011 report what the manifest actually holds (FR-060).
 */
export const STATE_COUNT = allStates().length;
