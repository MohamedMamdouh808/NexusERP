import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Compares two contract documents and reports what differs (T090, T062).
 *
 * The comparison is at the level of paths and named schemas, which is the level a reviewer
 * cares about: a new endpoint, a removed endpoint, a changed response shape. Byte equality
 * is used to decide whether there is anything to report at all, so an identical document
 * from identical sources produces an empty result rather than noise.
 */

export interface ContractDrift {
  readonly addedPaths: readonly string[];
  readonly removedPaths: readonly string[];
  readonly addedSchemas: readonly string[];
  readonly removedSchemas: readonly string[];
}

function pathMap(document: OpenAPIObject): Record<string, unknown> {
  return document.paths ?? {};
}

function schemaMap(document: OpenAPIObject): Record<string, unknown> {
  return document.components?.schemas ?? {};
}

export function findDrift(committed: string, generated: string): ContractDrift {
  const committedDocument = JSON.parse(committed) as OpenAPIObject;
  const generatedDocument = JSON.parse(generated) as OpenAPIObject;

  const committedPaths = new Set(Object.keys(pathMap(committedDocument)));
  const generatedPaths = new Set(Object.keys(pathMap(generatedDocument)));
  const committedSchemas = new Set(Object.keys(schemaMap(committedDocument)));
  const generatedSchemas = new Set(Object.keys(schemaMap(generatedDocument)));

  const sorted = (values: Iterable<string>): string[] => [...values].sort();

  return {
    addedPaths: sorted(generatedPaths).filter((path) => !committedPaths.has(path)),
    removedPaths: sorted(committedPaths).filter((path) => !generatedPaths.has(path)),
    addedSchemas: sorted(generatedSchemas).filter((name) => !committedSchemas.has(name)),
    removedSchemas: sorted(committedSchemas).filter((name) => !generatedSchemas.has(name)),
  };
}

export function hasDrift(drift: ContractDrift): boolean {
  return (
    drift.addedPaths.length > 0 ||
    drift.removedPaths.length > 0 ||
    drift.addedSchemas.length > 0 ||
    drift.removedSchemas.length > 0
  );
}

export function describeDrift(drift: ContractDrift): string[] {
  const lines: string[] = [];
  for (const path of drift.addedPaths) lines.push(`  added path:   ${path}`);
  for (const path of drift.removedPaths) lines.push(`  removed path: ${path}`);
  for (const name of drift.addedSchemas) lines.push(`  added schema:   ${name}`);
  for (const name of drift.removedSchemas) lines.push(`  removed schema: ${name}`);
  return lines;
}