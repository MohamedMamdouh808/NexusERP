/**
 * Fails when a production build contains the development gallery (T005, FR-070).
 *
 * FR-035 says the gallery and the sample record data it needs MUST be absent from
 * a production build. That is a claim about the BUILD OUTPUT, not about the
 * source: `router.tsx` registering the gallery behind `import.meta.env.DEV` plus a
 * dynamic import is the mechanism, and dead-code elimination is the thing that
 * has to actually happen. A build where the mechanism silently stopped working —
 * a static import, a `DEV` check that Vite inlined as truthy, a barrel that
 * re-exported the gallery — would still show a clean-looking source tree while
 * shipping the gallery to every user. This check reads the artefact instead.
 *
 * How it works: the gallery's own module carries `GALLERY_MARKER` as a string
 * literal. If the gallery reached the bundle, so did its marker. The check scans
 * `dist/assets/*.js` for it and exits non-zero when it is found.
 *
 * What it proves, exactly:
 *
 *   - the marker string is absent from every `dist/assets/*.js` file
 *
 * What it does NOT prove, stated so nobody mistakes a pass for more than it is:
 * this is a marker check, not a proof that no gallery code reached the bundle. A
 * gallery file whose marker was tree-shaken away while its code survived would
 * pass. The marker is deliberately referenced by the gallery's rendered output,
 * so it cannot be dropped without the gallery being dropped too, but the check
 * cannot see through to that and does not pretend to.
 *
 * `tsx` runs this script and it builds no Nest DI container, which is the only
 * thing AGENTS.md forbids `tsx` from doing.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GALLERY_MARKER } from '../src/dev/gallery/gallery-marker';

/**
 * The single definition of the marker lives with the gallery. The gallery imports
 * it and renders it, so it survives minification whenever the gallery survives;
 * nothing else in the application references it.
 */
export { GALLERY_MARKER };

export interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Pure matcher, so the check itself can be tested without a build on disk. */
export function findGalleryMarker(
  files: readonly { file: string; source: string }[],
  marker: string,
): Hit[] {
  const hits: Hit[] = [];

  for (const { file, source } of files) {
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (line.includes(marker)) {
        hits.push({ file, line: index + 1, text: line.slice(0, 200) });
      }
    });
  }

  return hits;
}

function collectBundleFiles(assetsDir: string): string[] {
  return readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => join(assetsDir, entry.name));
}

function main(targets: string[]): number {
  const marker = GALLERY_MARKER;
  const assetsDirs = targets.length > 0 ? targets : [join('dist', 'assets')];
  const scanned: { file: string; source: string }[] = [];
  const missing: string[] = [];

  for (const dir of assetsDirs) {
    const absolute = resolve(dir);
    if (!existsSync(absolute)) {
      missing.push(absolute);
      continue;
    }
    for (const file of collectBundleFiles(absolute)) {
      scanned.push({ file, source: readFileSync(file, 'utf8') });
    }
  }

  if (missing.length > 0) {
    console.error('check-no-gallery-in-build: no build output to check.');
    for (const dir of missing) {
      console.error(`  missing: ${dir}`);
    }
    console.error('Run `npm run build` first. A check that cannot read the build cannot pass it.');
    return 1;
  }

  const hits = findGalleryMarker(scanned, marker);

  if (hits.length === 0) {
    console.log(
      `check-no-gallery-in-build: ${scanned.length} bundle file(s) scanned, the gallery is absent`,
    );
    return 0;
  }

  console.error(`check-no-gallery-in-build: the development gallery reached the build (${hits.length} file(s)).`);
  console.error(`Marker found: ${marker}`);
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}  ${hit.text}`);
  }
  console.error('FR-035 requires the gallery route and its data to be absent from a production build.');

  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
