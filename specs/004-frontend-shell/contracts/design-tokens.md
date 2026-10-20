# Contract: Design tokens

Every colour, spacing, radius, shadow and type value the direction introduces reaches the
interface through the existing token pipeline (spec FR-003). No component carries a raw design
value, and no exemption is added to the guard (FR-051).

## Pipeline

```text
design-system/nexuserp/MASTER.md        (source of truth — amended first, FR-001, FR-005)
        │ transcribed by hand
        ▼
frontend/src/styles/tokens.css          (the ONLY file permitted a raw value in frontend/src)
        │ @import './tokens.css' theme(inline)
        ▼
frontend/src/styles/app.css             (Tailwind 4 theme bridge + documented class names)
        │ var(--token) and utility classes
        ▼
components (frontend/src/components/**)
```

## Rules

1. **One place.** A hex colour, an `rgb()`/`hsl()` call, or a Tailwind arbitrary colour value
   (`bg-[#123456]`) may exist only in `tokens.css`. `scripts/check-no-raw-design-values.ts`
   fails the build otherwise (FR-003, SC-002).
2. **The guard stays unchanged.** No new exemption is added to `EXEMPT_FILES` or `RULES` to make
   this feature pass; the guard is deliberately re-broken and shown failing, then shown passing
   (FR-051, SC-002).
3. **Token names stay in Tailwind 4 namespaces** (`--color-*`, `--spacing-*`, `--font-*`,
   `--shadow-*`) so the theme bridge registers them without renaming (established by the
   platform foundation; `research.md` R-003 keeps it).
4. **Typography delivery changes, values do not.** `--font-ui` and `--font-mono` keep their
   values; the faces become self-hosted WOFF2 under `frontend/public/fonts/` and the remote
   Google Fonts `@import` in `app.css` is removed (R-002). The master file's typography section
   is amended to record this.
5. **Amending a token means amending the master file.** Adding a token here without adding it to
   `MASTER.md` is a defect (FR-005).

## Values this feature adds

The direction's existing palette is reused. Where the direction needs a pairing the master file
has not stated — notably the active sidebar pill's text on `--color-primary`, the page
background against white surfaces, and the focus ring against each surface — each is measured
and recorded before use (FR-004, SC-003), and any pair below its requirement is changed rather
than accepted.

## Verification

- `scripts/__tests__/no-raw-design-values.spec.ts` — existing guard tests stay green.
- The guard is run in the frontend build step and in CI (`npm run check:design-values`).
- `evidence/contrast-report.md` records every measured pair (FR-052).
