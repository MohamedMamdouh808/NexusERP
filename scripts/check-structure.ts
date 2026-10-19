#!/usr/bin/env node
/**
 * Structure guard (T041, FR-012).
 *
 * The restructure moved four trees to the repository root:
 *
 *   apps/api       -> backend/
 *   apps/api/prisma-> database/prisma/
 *   apps/web       -> frontend/
 *   packages/shared-> shared/
 *
 * Nothing enforces that once the move is done. A stray `mkdir apps` or a copied
 * snippet containing `apps/api/src/main.ts` in a workflow, a script, or a README
 * reintroduces the layout this feature removed, and the failure surfaces much later
 * as a path that resolves in one place and not another.
 *
 * This guard fails when:
 *
 *   1. `apps/` or `packages/` exists at the repository root again.
 *   2. a tracked file outside the two spec feature directories still names an old
 *      path (`apps/api`, `apps/web`, `packages/shared`).
 *
 * Both spec directories are excluded on purpose. `specs/001-platform-foundation`
 * is the historical record of the old layout, and `specs/002-repo-restructure` is
 * the definition of the move itself; both must be able to print the old paths in
 * order to describe them. Every other tracked file is a build input or living
 * documentation and must name the new layout.
 *
 * Exit codes: 0 clean, 1 a violation, 2 the check could not run.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Directories that must not exist at the repository root. */
const FORBIDDEN_DIRECTORIES = ['apps', 'packages'];

/** Directories allowed to name the old paths: they exist to describe them. */
const ALLOWED_PREFIXES = ['specs/001-platform-foundation/', 'specs/002-repo-restructure/'];

interface OldPathRule {
  readonly pattern: RegExp;
  readonly description: string;
}

const OLD_PATH_RULES: readonly OldPathRule[] = [
  { pattern: /apps\/(?:api|web)\b/, description: 'the old apps/ layout' },
  { pattern: /packages\/shared\b/, description: 'the old packages/shared layout' },
];

/** This file names the old paths in order to forbid them. */
const SELF_PATH = 'scripts/check-structure.ts';

export interface StructureViolation {
  readonly kind: 'directory' | 'reference';
  readonly path: string;
  readonly message: string;
}

/** Walks up from `startDir` to the directory whose package.json declares workspaces. */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir);
  for (let depth = 0; depth < 10; depth++) {
    const manifest = join(current, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown };
        if (Array.isArray(parsed.workspaces)) return current;
      } catch {
        // An unreadable package.json is not the repository root; keep walking up.
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not locate the repository root by walking up from ${startDir}`);
}

/** Tracked files, as repository-relative POSIX paths. */
function listTrackedFiles(repoRoot: string): string[] {
  const output = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function checkStructure(
  repoRoot: string,
  trackedFiles: readonly string[],
  readFile: (path: string) => string,
): StructureViolation[] {
  const violations: StructureViolation[] = [];

  for (const directory of FORBIDDEN_DIRECTORIES) {
    if (existsSync(join(repoRoot, directory))) {
      violations.push({
        kind: 'directory',
        path: `${directory}/`,
        message:
          `The "${directory}/" directory exists at the repository root again. This feature ` +
          `removed it; every workspace now lives at the root ` +
          '(frontend/, backend/, database/, shared/).',
      });
    }
  }

  for (const file of trackedFiles) {
    if (file === SELF_PATH) continue;
    if (ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;

    let contents: string;
    try {
      contents = readFile(file);
    } catch {
      // A tracked file that cannot be read (deleted in the working tree, binary) cannot
      // name a path. Skipping it is not a pass for the rest of the file list.
      continue;
    }

    for (const [index, line] of contents.split(/\r?\n/).entries()) {
      for (const rule of OLD_PATH_RULES) {
        if (rule.pattern.test(line)) {
          violations.push({
            kind: 'reference',
            path: file,
            message: `${file}:${index + 1} references ${rule.description}: ${line.trim()}`,
          });
        }
      }
    }
  }

  return violations;
}

function main(): void {
  let repoRoot: string;
  try {
    repoRoot = findRepoRoot();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
    return;
  }

  let trackedFiles: string[];
  try {
    trackedFiles = listTrackedFiles(repoRoot);
  } catch (error) {
    console.error(
      `structure: cannot run - git ls-files failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(2);
    return;
  }

  const violations = checkStructure(repoRoot, trackedFiles, (file) =>
    readFileSync(join(repoRoot, file), 'utf8'),
  );

  if (violations.length === 0) {
    console.log(
      `structure: OK - no apps/ or packages/ directory, and no tracked file outside the ` +
        `feature specifications names an old path (${trackedFiles.length} files scanned).`,
    );
    process.exit(0);
  }

  console.error('structure: FAILED');
  console.error(
    'The repository layout is frontend/, backend/, database/ and shared/ at the root.\n',
  );
  for (const violation of violations) {
    console.error(`  ${violation.message}`);
  }
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

// Only run as a script, so importing this module from a test does not execute it.
const invokedDirectly =
  typeof process.argv[1] === 'string' && process.argv[1].includes('check-structure');

if (invokedDirectly) {
  main();
}
