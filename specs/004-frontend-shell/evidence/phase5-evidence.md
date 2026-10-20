# Phase 5 Evidence (T038–T059)

All focused test runs used Vitest with a two-thread pool and a 60-second hard timeout per run. The final component/gallery run used a 120-second hard timeout and wrote output to `phase5-component-gallery-tests.log`. Build and `tsx` guard commands used a temporary Node preload because this Windows Node 22.13.0 environment throws `uv_os_get_passwd returned ENOMEM` from `os.userInfo()`; the preload and temporary negative-control bundles were removed after the runs.

| Task | Test / implementation evidence | Red observation | Green observation |
|---|---|---|---|
| T038 | `components/ui/__tests__/button.spec.tsx` | Removing Button's applied class made the suite exit 1 (`phase5-t038-red.log`). | Included in the final Phase 5 run. |
| T039 | `components/ui/__tests__/form-controls.spec.tsx` | Breaking the Input label association made the suite exit 1 (`phase5-t039-red.log`). | Included in the final Phase 5 run. |
| T040 | `components/ui/__tests__/badge-card.spec.tsx` | Lowercasing Badge status text made the suite exit 1 (`phase5-t040-red.log`). | Included in the final Phase 5 run. |
| T041 | `components/ui/__tests__/data-table.spec.tsx` | Removing `aria-sort` made the suite exit 1 (`phase5-t041-red.log`). | Included in the final Phase 5 run. |
| T042 | `components/ui/__tests__/dialog.spec.tsx` | The new focus-trap and focus-return test failed before the Dialog change: 1 failed, 6 passed (`phase5-dialog-focus-red.log`). | After implementation, 7/7 passed (`phase5-dialog-focus-green.log`); also included in final run. |
| T043 | `components/ui/__tests__/dropdown-menu.spec.tsx` | Reversing the outside-click condition made the suite exit 1 (`phase5-t043-red.log`). | Included in the final Phase 5 run. |
| T044 | `components/ui/__tests__/toast.spec.tsx` | Forcing every toast to `role="alert"` made the suite exit 1 (`phase5-t044-red.log`). | Included in the final Phase 5 run. |
| T045 | `components/ui/__tests__/feedback.spec.tsx` | Changing Skeleton `aria-busy` to false made the suite exit 1 (`phase5-t045-red.log`). | Included in the final Phase 5 run. |
| T046 | `dev/gallery/__tests__/state-manifest.guard.spec.ts` | Blank `Button.default` fixture failed with “missing or empty fixture slot” (`phase5-manifest-negative.log`). | Restored manifest: 2/2 passed (`phase5-manifest-pass.log`). |
| T047 | `dev/gallery/__tests__/state-manifest-matrix.spec.ts` | Adding an undeclared manifest state made matrix parity fail (`phase5-t047-red.log`). | Restored matrix: 2/2 passed, 75 states, 100% fixture/assertion coverage (`phase5-t047.log`). |
| T048 | `dev/gallery/__tests__/gallery.spec.tsx` | Removing `Button.default` displayed “Missing fixture” and failed the gallery test (`phase5-gallery-negative.log`). | Restored fixture: 2/2 passed; all 15 component sections and all manifest states were found (`phase5-gallery-pass.log`). |
| T049–T053 | Primitive and icon implementations in `components/ui/` | State-specific mutations for T038–T045 above exercised the primitive contracts. | Final component/gallery run passed; TypeScript and production bundle also passed. |
| T054–T057 | Barrel migration, fixtures, gallery route and dev-only router registration | T048's missing-fixture control and T059's injected build marker cover the gallery path. | TypeScript and Vite production build passed; output contained no gallery marker. |
| T058 | `dev/gallery/__tests__/every-control.spec.tsx` | Making the failure switch a no-op caused the control check to exit 1 (`phase5-every-control-negative.log`). | Restored control: 2/2 passed; both demo switches, dialog cancellation and removal/toast flows changed visible state (`phase5-every-control-pass.log`). |
| T059 | `npm run build` and `npm run check:no-gallery` | A synthetic bundle containing `nexuserp-dev-gallery-route` was rejected with exit 1 (`phase5-no-gallery-negative.log`). | Production build passed: 2,033 modules transformed; JS 340.74 kB, CSS 23.27 kB; both build and separate post-build checks scanned one JS bundle and reported the gallery absent (`phase5-build.log`, `phase5-no-gallery-pass.log`). |

**Final focused run:** 14 test files passed, 89 tests passed. The initial full frontend run had 4 failing files and 6 failing tests: the Phase 5 matrix parity and gallery-control guard failures were fixed in this phase; the remaining failures are three raw-design-value script tests and one keyboard test. The Phase 5 production build and exclusion check passed after removing the unused keyboard-test import that blocked `tsc -b`.
