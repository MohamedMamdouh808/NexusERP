#!/usr/bin/env node
/**
 * Dependency boundary guard (T034/T035, FR-013).
 *
 * The restructure gives each workspace one owner and one direction of dependency:
 *
 *   frontend/  may use shared/ only
 *   backend/   may use shared/ and database/
 *   database/  must not use frontend/ or backend/
 *   shared/    must not use frontend/ or backend/
 *
 * The boundaries are checked twice, because they can be broken in two different
 * ways and each way has its own failure mode:
 *
 *   1. DECLARED dependencies (package.json). A forbidden `@nexuserp/*` entry here
 *      is what actually pulls a workspace into another's install tree.
 *   2. SOURCE imports. A `from '@nexuserp/x'` that no manifest declares resolves
 *      only while a hoisted copy happens to be on disk, so it works locally and
 *      fails in a clean install.
 *
 * ESLint's `no-restricted-imports` covers the second case for files inside each
 * workspace's lint project. This script is the one check that also covers the
 * manifests, and it runs from the repository root over every workspace at once.
 *
 * Exit codes: 0 clean, 1 a violation, 2 the check could not run.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

interface Workspace {
  /** Directory at the repository root. */
  readonly directory: string;
  /** Package name as declared in that workspace's package.json. */
  readonly packageName: string;
  /**
   * Internal package names this workspace may depend on. `null` means the workspace
   * is unrestricted except by `forbidden`.
   */
  readonly allowed: readonly string[] | null;
  /** Internal package names this workspace must never depend on. */
  readonly forbidden: readonly string[];
}

const WORKSPACES: readonly Workspace[] = [
  {
    directory: 'frontend',
    packageName: '@nexuserp/web',
    allowed: ['@nexuserp/shared'],
    forbidden: [],
  },
  {
    directory: 'backend',
    packageName: '@nexuserp/api',
    allowed: ['@nexuserp/shared', '@nexuserp/database'],
    forbidden: [],
  },
  {
    directory: 'database',
    packageName: '@nexuserp/database',
    allowed: null,
    forbidden: ['@nexuserp/web', '@nexuserp/api'],
  },
  {
    directory: 'shared',
    packageName: '@nexuserp/shared',
    allowed: null,
    forbidden: ['@nexuserp/web', '@nexuserp/api'],
  },
];

/** Every internal package name, so an undeclared one is detected by name alone. */
const INTERNAL_PACKAGES = new Set(WORKSPACES.map((workspace) => workspace.packageName));

export interface BoundaryViolation {
  readonly workspace: string;
  readonly kind: 'dependency' | 'import';
  readonly packageName: string;
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

function isAllowed(workspace: Workspace, packageName: string): boolean {
  if (workspace.forbidden.includes(packageName)) return false;
  if (workspace.allowed !== null && !workspace.allowed.includes(packageName)) return false;
  return true;
}

/** Source files under a workspace that can carry an import: no build output, no deps. */
function listSourceFiles(workspaceDir: string): string[] {
  const found: string[] = [];
  const skip = new Set(['node_modules', 'dist', 'coverage', '.git', 'playwright-report', 'test-results']);

  const walk = (directory: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.has(entry)) continue;
      const full = join(directory, entry);
      let stats: ReturnType<typeof statSync>;
      try {
        stats = statSync(full);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(?:ts|tsx|mts|cts|mjs|js|jsx)$/.test(entry)) found.push(full);
    }
  };

  walk(workspaceDir);
  return found;
}

const IMPORT_PATTERN = new RegExp(
  String.raw`(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](${[...INTERNAL_PACKAGES].join('|').replace(/[/@]/g, '\\$&')})['"]`,
  'g',
);

export function checkBoundaries(
  repoRoot: string,
  readFile: (path: string) => string,
  listFiles: (directory: string) => string[],
): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  for (const workspace of WORKSPACES) {
    const workspaceDir = join(repoRoot, workspace.directory);
    const manifestPath = join(workspaceDir, 'package.json');

    if (!existsSync(manifestPath)) {
      violations.push({
        workspace: workspace.directory,
        kind: 'dependency',
        packageName: workspace.packageName,
        message: `${workspace.directory}/package.json is missing; the workspace cannot be checked.`,
      });
      continue;
    }

    const manifest = JSON.parse(readFile(manifestPath)) as Record<string, unknown>;
    const declaredSections = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

    for (const section of declaredSections) {
      const declared = manifest[section];
      if (declared === null || typeof declared !== 'object') continue;
      for (const name of Object.keys(declared as Record<string, unknown>)) {
        if (!INTERNAL_PACKAGES.has(name)) continue;
        if (isAllowed(workspace, name)) continue;
        violations.push({
          workspace: workspace.directory,
          kind: 'dependency',
          packageName: name,
          message:
            `${workspace.directory}/package.json declares "${name}" in ${section}, which the ` +
            'dependency boundaries forbid.',
        });
      }
    }

    for (const file of listFiles(workspaceDir)) {
      const contents = readFile(file);
      for (const match of contents.matchAll(IMPORT_PATTERN)) {
        const name = match[1];
        if (name === undefined) continue;
        if (isAllowed(workspace, name)) continue;
        const position = relative(repoRoot, file).split(sep).join('/');
        violations.push({
          workspace: workspace.directory,
          kind: 'import',
          packageName: name,
          message: `${position} imports "${name}", which the dependency boundaries forbid.`,
        });
      }
    }
  }

  return violations;
}

function describeBoundaries(): string {
  return WORKSPACES.map((workspace) => {
    if (workspace.allowed !== null) {
      return `  ${workspace.directory}/ -> ${workspace.allowed.join(', ') || 'nothing internal'}`;
    }
    return `  ${workspace.directory}/ -> must not use ${workspace.forbidden.join(', ')}`;
  }).join('\n');
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

  let violations: BoundaryViolation[];
  try {
    violations = checkBoundaries(
      repoRoot,
      (path) => readFileSync(path, 'utf8'),
      listSourceFiles,
    );
  } catch (error) {
    console.error(
      `boundaries: cannot run - ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
    return;
  }

  if (violations.length === 0) {
    console.log('boundaries: OK - every workspace respects its dependency direction.');
    console.log(describeBoundaries());
    process.exit(0);
  }

  console.error('boundaries: FAILED');
  console.error('Allowed dependency directions:\n' + describeBoundaries() + '\n');
  for (const violation of violations) {
    console.error(`  [${violation.kind}] ${violation.message}`);
  }
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

// Only run as a script, so importing this module from a test does not execute it.
const invokedDirectly =
  typeof process.argv[1] === 'string' && process.argv[1].includes('check-boundaries');

if (invokedDirectly) {
  main();
}
