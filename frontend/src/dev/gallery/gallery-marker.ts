/**
 * The development gallery's build marker (T005, FR-070).
 *
 * `scripts/check-no-gallery-in-build.ts` proves FR-035 — "the gallery and the
 * sample record data it needs MUST be absent from a production build" — by
 * scanning the built `dist/assets/*.js` files for this exact string. A claim about
 * a build has to be checked against the build, not against the source that was
 * supposed to be eliminated.
 *
 * The marker is rendered by the gallery as a `data-gallery` attribute, so it is a
 * live string literal in the bundle whenever the gallery is in the bundle, and it
 * cannot be tree-shaken away while the gallery itself survives. Nothing outside
 * `src/dev/gallery/` and the check script references it.
 *
 * If this constant is ever edited, the check follows automatically: both sides
 * import this one definition.
 */
export const GALLERY_MARKER = 'nexuserp-dev-gallery-route';
