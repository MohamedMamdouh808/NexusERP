import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../app.module';
import { buildOpenApiDocument, stableStringify } from './openapi-document';

/**
 * Generates the committed contract (T089).
 *
 * The document is built from the real application module by the same builder
 * `src/main.ts` uses, so the committed artifact describes the API that actually ships.
 *
 * This file lives under `src/` because `tsconfig.build.json` excludes `scripts/`: the
 * build emits `dist/`, and AGENTS.md forbids booting the app through `tsx`, which does
 * not emit the decorator metadata Nest needs. Run the compiled output:
 *
 *   npm run build --workspace @nexuserp/api
 *   npm run openapi:generate --workspace @nexuserp/api
 *
 * `compile()` is used rather than `NestFactory.create` so that generating the contract
 * does not open a database connection.
 */

async function generate(): Promise<string> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();

  // Mirrors src/main.ts exactly: the global prefix and the validation pipe are part of the
  // document (the prefix appears in every path).
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const document = buildOpenApiDocument(app);
  await app.close();

  return `${stableStringify(document)}\n`;
}

async function main(): Promise<void> {
  const target = join(process.cwd(), 'openapi.json');
  const json = await generate();
  writeFileSync(target, json, 'utf8');
  console.log(`openapi: wrote ${target} (${json.length} bytes)`);
}

void main().catch((error: unknown) => {
  console.error('openapi: generation failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});