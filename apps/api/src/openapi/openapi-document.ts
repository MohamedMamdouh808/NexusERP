import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

/**
 * The one place the contract is defined (T089, T091).
 *
 * `src/main.ts` serves the human-readable page from this and the committed
 * `openapi.json` is generated from it, so the served page and the committed artifact
 * cannot describe different APIs. A drift check (T090) compares them.
 */
export const OPENAPI_TITLE = 'NexusERP API';
export const OPENAPI_VERSION = '0.1.0';
export const OPENAPI_SERVER = '/api/v1';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(OPENAPI_TITLE)
      .setDescription(
        'Generated from the service source. Committed as openapi.json and diff-checked in ' +
          'CI, so an unintended contract change cannot merge unreviewed.',
      )
      .setVersion(OPENAPI_VERSION)
      .addServer(OPENAPI_SERVER)
      .build(),
  );
}

/**
 * Serialises a document with its object keys in a stable order.
 *
 * Swagger builds the document from route metadata, and object key order is not part of the
 * contract. Without a stable ordering, two generations from identical sources can produce
 * different bytes, and a drift check would report a change that is not one.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalise = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalise);
    if (node !== null && typeof node === 'object') {
      if (seen.has(node)) return '[Circular]';
      seen.add(node);
      const source = node as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) {
        sorted[key] = normalise(source[key]);
      }
      seen.delete(node);
      return sorted;
    }
    return node;
  };

  return JSON.stringify(normalise(value), null, 2);
}