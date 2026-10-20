# Third-party notices — `frontend`

Required by FR-057: the icon library's licence notice is recorded here, where the project's
other third-party notices live. The repository's own code is `UNLICENSED` (see
`package.json`); nothing below implies otherwise.

This feature adds exactly **one** dependency (plan.md Technical Context, FR-055). The two
typefaces are not dependencies — they are asset files served by the application itself — but
their licences are recorded here because they ship with the build.

---

## Runtime dependencies added by this feature

### `lucide-react` — ISC

| | |
|---|---|
| Package | [`lucide-react`](https://lucide.dev) |
| Version | `1.60.0` (range `^1.60.0` in `frontend/package.json`) |
| Licence | ISC, with a subset of icons under MIT (see below) |
| Why it is here | FR-055 permits exactly one permissively licensed icon library. It supplies the compact sidebar's per-entry glyphs and the icon-only controls the design system requires. |
| How it is used | Named imports only, one icon per import, so Vite tree-shakes the rest of the catalogue out of a build (FR-055, SC-013). Decorative icons are `aria-hidden`; every icon-only control also carries an accessible name and a tooltip (FR-056). |

Full licence text, as shipped in the package (`node_modules/lucide-react/LICENSE`):

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

A subset of Lucide's icons is derived from the Feather project and carries the MIT licence: the
names are listed in the package's own `LICENSE` file, and the MIT text is reproduced there too.
The permission notice and copyright notice (© 2013-present Cole Bemis) are retained in that
file, which is installed alongside the package.

---

## Typefaces served by the application (not dependencies)

Both faces are **self-hosted** (research.md R-002, T003–T004): the WOFF2 files live in
`frontend/public/fonts/` and are served from NexusERP's own origin. The remote Google Fonts
`@import` that used to sit in `src/styles/app.css` has been removed, so the interface makes no
third-party request at runtime.

| Asset | Files | Licence | Notice |
|---|---|---|---|
| Fira Sans | `fira-sans-400.woff2`, `fira-sans-500.woff2`, `fira-sans-600.woff2`, `fira-sans-700.woff2` | SIL Open Font License, Version 1.1 | `public/fonts/LICENSE-Fira-Sans.txt` |
| Fira Code | `fira-code-variable.woff2` | SIL Open Font License, Version 1.1 | `public/fonts/LICENSE-Fira-Code.txt` |

The full OFL 1.1 text is reproduced in full in each licence file beside the fonts, not
summarised here, because the licence's own condition is that it travels with the Font Software.

**One note on Fira Code's weights.** The design system uses Fira Code at 400, 500, 600 and 700.
Google's CSS declares four faces for those weights, but all four resolve to a single variable
file (verified by SHA-256 during T003 — all four downloads were byte-identical). Serving that one
file with `font-weight: 400 700` provides all four weights without shipping four copies of the
same 36,276 bytes. The family and its weights are unchanged; only the delivery is.

---

## What is deliberately absent

No third-party product name, logo or copied text appears in the interface, and no icon, glyph or
illustration was copied from the reference design (FR-046). Lucide is used as a dependency, which
FR-046 permits explicitly, rather than as a copied icon set.
