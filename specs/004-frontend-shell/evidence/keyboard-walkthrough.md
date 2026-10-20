# Keyboard Walkthrough (T074, FR-045, FR-053, SC-004)

Conducted with keyboard only (Tab, Shift+Tab, Enter, Space, Escape, Arrow keys).

| Interactive Element | Key Sequence | Observed Result | Focus Indicator | Pass/Fail |
|---|---|---|---|---|
| Skip to main content link | `Tab` (on load) | Appears at top left, bypasses sidebar | 2px solid ring | PASS |
| Organization Switcher (TopBar) | `Tab` | Focus moves to trigger | 2px solid ring | PASS |
| Organization Dropdown Menu | `Enter` / `ArrowDown` | Opens menu, selects items with arrow keys, `Escape` closes and restores focus | 2px solid ring | PASS |
| Preview User Menu (TopBar) | `Tab` | Focus moves to trigger | 2px solid ring | PASS |
| Navigation: Overview | `Tab` | Navigates to `/`, marks `aria-current="page"` | 2px solid ring | PASS |
| Navigation: System Health | `Tab` | Navigates to `/health`, marks `aria-current="page"` | 2px solid ring | PASS |
| Navigation: Soon items | `Tab` | Bypassed by keyboard tab order (`tabIndex={-1}`) | N/A (disabled) | PASS |
| PageHeader Primary Action | `Tab` | Focus moves to primary button, activates on `Enter`/`Space` | 2px solid ring | PASS |
| DataTable Sort Headers | `Tab` / `Enter` | Cycles sort direction, announces aria-sort | 2px solid ring | PASS |
| Dialog / ConfirmDialog | Open -> `Tab` -> `Escape` | Focus trapped within dialog, Escape dismisses, focus returns to trigger | 2px solid ring | PASS |
| Toast Dismiss Button | `Tab` / `Enter` | Dismisses notification without losing visual focus | 2px solid ring | PASS |
