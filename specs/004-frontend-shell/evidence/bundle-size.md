# Bundle-size evidence

Required by FR-058 and SC-013: the icon dependency's cost is **reported, measured**, not assumed
(plan.md Technical Context; research.md R-012).

## Baseline (T001) — before this feature

Taken on 2026-10-20 on `main`, from a clean production build
(`npm run build --workspace @nexuserp/web`, Vite 6.4.4).

Gate set at baseline: `typecheck` clean, `lint` clean, `vitest run` 58/58 passing,
`vite build` succeeds.

| Asset | Raw | gzip |
|---|---|---|
| `dist/assets/index-*.js` | 314.90 kB | 96.05 kB |
| `dist/assets/index-*.css` | 14.57 kB | 3.81 kB |
| `dist/index.html` | 0.53 kB | 0.34 kB |
| Font assets under `dist/assets/` | none — the faces were fetched from Google Fonts at runtime | — |

Modules transformed: 100.

**Note on the font row.** The baseline carries **no** font asset in the build, because
`src/styles/app.css` fetched Fira Sans and Fira Code from `fonts.googleapis.com` at runtime. This
feature replaces that with self-hosted WOFF2 (R-002), so the font row grows from zero while the
runtime request to a third party disappears. The two are reported together below so the trade is
visible rather than one side of it.

## After this feature (T077)

_Filled in by T077 once the component set and the gallery are complete._
