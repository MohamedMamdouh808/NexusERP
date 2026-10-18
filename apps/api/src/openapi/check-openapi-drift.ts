import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../app.module';
import { buildOpenApiDocument, stableStringify } from './openapi-document';
import { describeDrift, findDrift, hasDrift } from './drift';

/**
 * Fails when the committed contract does not match the source (T090).
 *
 * Regenerates the document from the same builder and compares it with
 * `apps/api/openapi.json`. A difference is an unreviewed contract change, which FR-044
 * requires to be visible rather than merged silently.
 *
 * `OPENAPI_WRITE=1` writes the fresh document instead of comparing, which is how the
 * artifact is refreshed after a change has been reviewed.
 */

async function freshDocument(): Promise<string> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const document = buildOpenApiDocument(app);
  await app.close();
  return `${stableStringify(document)}\n`;
}

async function main(): Promise<number> {
  const target = join(process.cwd(), 'openapi.json');
  const committed = readFileSync(target, 'utf8');
  const generated = await freshDocument();

  if (committed === generated) {
    console.log('openapi: the committed contract matches the source');
    return 0;
  }

  if (process.env.OPENAPI_WRITE === '1') {
    writeFileSync(target, generated, 'utf8');
    console.log('openapi: rewrote the committed contract from the source');
    return 0;
  }

  const drift = findDrift(committed, generated);
  console.error('openapi: DRIFT - the committed contract does not match the source.');
  for (const line of describeDrift(drift)) {
    console.error(line);
  }
  if (!hasDrift(drift)) {
    console.error('  (the documents differ in content but not in paths or schemas)');
  }
  console.error('  Run `npm run openapi:generate` to refresh the artifact after reviewing the change.');
  return 1;
}

void main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error('openapi: comparison failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });