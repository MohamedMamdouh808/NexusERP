import { Controller, Get, Type, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

import { AppModule } from '../../src/app.module';
import { findDrift, hasDrift } from '../../src/openapi/drift';
import { buildOpenApiDocument, stableStringify } from '../../src/openapi/openapi-document';

/**
 * T062, FR-044: the committed contract must match the source, and a changed endpoint must
 * produce a diff.
 *
 * The first assertion is the drift check that runs in CI: the committed `openapi.json` is
 * compared with a document generated from the same builder, and a difference fails the
 * job. The second is the proof that the comparison can actually detect a change: a route
 * that exists in the source but not in the committed artifact must be reported as an added
 * path. Without it, a comparison that always returned "no drift" would pass the first
 * assertion and prove nothing.
 */

const API_ROOT = resolve(__dirname, '..', '..');
const ARTIFACT = join(API_ROOT, 'openapi.json');

/** Builds the document from the real application module, optionally with extra routes. */
async function generateDocument(controllers: Type<unknown>[] = []): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const document = buildOpenApiDocument(app);
  await app.close();

  return `${stableStringify(document)}\n`;
}

/** A route that does not exist in the committed contract. */
@Controller('probe-extra')
class ProbeExtraController {
  @Get()
  probe(): { ok: true } {
    return { ok: true };
  }
}

describe('contract drift (T062, FR-044)', () => {
  it('the committed artifact matches the document generated from the source', async () => {
    const committed = readFileSync(ARTIFACT, 'utf8');
    const generated = await generateDocument();

    const drift = findDrift(committed, generated);

    expect(drift).toEqual({
      addedPaths: [],
      removedPaths: [],
      addedSchemas: [],
      removedSchemas: [],
    });
  });

  it('a changed endpoint produces a diff naming the new path', async () => {
    const committed = readFileSync(ARTIFACT, 'utf8');
    const generated = await generateDocument([ProbeExtraController]);

    const drift = findDrift(committed, generated);

    expect(hasDrift(drift)).toBe(true);
    expect(drift.addedPaths).toContain('/api/v1/probe-extra');
  });

  it('a removed endpoint produces a diff naming the missing path', () => {
    // A committed contract that carries a path the source does not must report it as
    // removed, so deleting an endpoint cannot pass unnoticed either.
    const committed = JSON.stringify(
      {
        openapi: '3.0.0',
        paths: { '/api/v1/gone': { get: {} }, '/api/v1/health': { get: {} } },
        components: { schemas: { A: {} } },
      },
      null,
      2,
    );
    const generated = JSON.stringify(
      {
        openapi: '3.0.0',
        paths: { '/api/v1/health': { get: {} } },
        components: { schemas: { A: {} } },
      },
      null,
      2,
    );

    const drift = findDrift(committed, generated);

    expect(drift.removedPaths).toContain('/api/v1/gone');
  });
});