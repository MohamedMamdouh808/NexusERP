import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from '@jest/globals';

/**
 * T115: both Dockerfiles copy the package manifests and the lockfile and run `npm ci`
 * BEFORE copying source.
 *
 * Why this is enforced rather than left to review:
 *
 *   `npm ci` is the expensive step. If any source file is copied before it, Docker cannot
 *   reuse the install layer, so every change to a `.ts` file invalidates the entire
 *   dependency install and every image build re-downloads and re-links the whole tree. It
 *   also means the image can be built from a tree whose sources have not been committed,
 *   which is how an image diverges from the lockfile it was supposed to reflect.
 *
 *   The property is structural, so it is asserted structurally: the stage that runs
 *   `npm ci` must not contain a source COPY at all, and the source COPY must appear in a
 *   later stage.
 */

// apps/api/scripts/__tests__ -> scripts -> api -> apps -> repository root.
const repoRoot = join(dirname(__dirname), '..', '..', '..');

interface Stage {
  readonly name: string;
  /** Mutable by construction: parseStages appends to it. */
  lines: string[];
}

/** Splits a Dockerfile into stages, keyed by the `AS <name>` on the FROM line. */
function parseStages(path: string): Stage[] {
  const stages: Stage[] = [];
  let current: Stage | undefined;

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const from = /^FROM\s+.*\s+AS\s+([\w-]+)$/i.exec(line);
    if (from) {
      current = { name: from[1] ?? 'unnamed', lines: [] };
      stages.push(current);
      continue;
    }

    current?.lines.push(line);
  }

  return stages;
}

/**
 * A COPY is a MANIFEST copy when it names `package.json`, `package-lock.json`, or the
 * postinstall hook. Everything else is source.
 *
 * This distinction is the whole point of the check, and it is why the naive version of this
 * test failed: `COPY apps/api/package.json ./apps/api/` starts with `apps/`, so a
 * directory-prefix test calls it source. It is a manifest, and it is exactly what must be
 * allowed before `npm ci`.
 */
const MANIFEST_COPY = /^COPY\s+(?:--from=\S+\s+)?.*(?:package\.json|package-lock\.json|postinstall\.mjs)/i;

const isSourceCopy = (line: string): boolean =>
  /^COPY\s+(?!--from=)/i.test(line) && !MANIFEST_COPY.test(line);

describe('Dockerfile layer ordering (T115)', () => {
  const apiDockerfile = join(repoRoot, 'docker', 'api.Dockerfile');
  const webDockerfile = join(repoRoot, 'docker', 'web.Dockerfile');

  function depsStage(path: string): Stage {
    const stages = parseStages(path);
    const deps = stages.find((stage) => stage.name === 'deps');
    if (deps === undefined) {
      throw new Error(`${path} has no 'deps' stage`);
    }
    return deps;
  }

  describe.each([
    ['docker/api.Dockerfile', apiDockerfile],
    ['docker/web.Dockerfile', webDockerfile],
  ])('%s', (_name, path) => {
    it('copies the root manifests and the lockfile into the dependency stage', () => {
      const lines = depsStage(path).lines;

      expect(lines.some((line) => /^COPY\s+package\.json\s+package-lock\.json\s+\.\//i.test(line))).toBe(
        true,
      );
      // Every workspace manifest must exist before `npm ci` runs.
      expect(lines.some((line) => MANIFEST_COPY.test(line) && /packages\/shared/.test(line))).toBe(
        true,
      );
    });

    it('runs npm ci in the dependency stage', () => {
      expect(depsStage(path).lines.some((line) => /^\s*RUN\s+npm\s+ci\b/.test(line))).toBe(true);
    });

    it('copies NO application source before npm ci', () => {
      // The load-bearing assertion. A source COPY here destroys the install cache and
      // lets the image be built from uncommitted sources.
      const lines = depsStage(path).lines;
      const installIndex = lines.findIndex((line) => /^\s*RUN\s+npm\s+ci\b/.test(line));
      expect(installIndex).toBeGreaterThan(-1);

      const beforeInstall = lines.slice(0, installIndex);
      expect(beforeInstall.filter((line) => isSourceCopy(line))).toEqual([]);
    });

    it('copies the postinstall hook before npm ci so the hook can resolve its own file', () => {
      // `npm ci` runs the root postinstall, so the script it invokes has to be in this
      // layer. This is the regression that broke both image builds once.
      const lines = depsStage(path).lines;
      const installIndex = lines.findIndex((line) => /^\s*RUN\s+npm\s+ci\b/.test(line));
      const beforeInstall = lines.slice(0, installIndex);
      expect(
        beforeInstall.some((line) => /scripts\/postinstall\.mjs/.test(line)),
      ).toBe(true);
    });

    it('copies application source only in a stage that comes after the dependency stage', () => {
      const stages = parseStages(path);
      const installIndex = stages.findIndex((stage) => stage.name === 'deps');
      expect(installIndex).toBeGreaterThan(-1);

      // The first stage that copies source must be after the deps stage.
      const sourceStage = stages.findIndex((stage) => stage.lines.some((line) => isSourceCopy(line)));
      expect(sourceStage).toBeGreaterThan(installIndex);
    });
  });
});