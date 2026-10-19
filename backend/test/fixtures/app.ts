import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getTestPrisma } from './database';
import { AppModule } from '../../src/app.module';

/**
 * Boots the real Nest application for integration tests.
 *
 * Uses the SAME module graph as production - the real global filter, the real global
 * permission guard, the real middleware - because a test that assembles its own wiring
 * proves nothing about the wiring that ships.
 *
 * The database is real (Constitution Principle V, FR-047). SQLite and in-memory
 * substitutes are not acceptable: the defects this product must not have - races, partial
 * writes, duplicate postings - do not appear against a faked database.
 */
export interface TestApp {
  app: INestApplication;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  // Touch the client first so a missing DATABASE_URL fails here with a clear message
  // rather than surfacing as a confusing connection error inside the first request.
  void getTestPrisma();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();

  // Mirrors main.ts exactly. A divergence here would mean the tests exercise a different
  // application from the one that ships, which defeats the purpose of the suite.
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters();
  app.enableShutdownHooks();

  await app.init();

  return {
    app,
    close: async () => {
      await app.close();
    },
  };
}

/** The canonical health address, used by several assertions. */
export const HEALTH_URL = '/api/v1/health';
