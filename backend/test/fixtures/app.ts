import type { INestApplication } from '@nestjs/common';
import { ValidationPipe, type InjectionToken } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { disconnectTestPrisma, getTestPrisma } from './database';
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
 *
 * `providerOverrides` replaces a provider inside the imported modules. The usage
 * checks are seams on purpose: a test that must prove the refusal of an
 * archive because the product is in use swaps in a check that says so.
 */
export interface TestApp {
  app: INestApplication;
  close: () => Promise<void>;
}

export async function createTestApp(
  providerOverrides: readonly { token: InjectionToken; useValue: unknown }[] = [],
): Promise<TestApp> {
  // Touch the client first so a missing DATABASE_URL fails here with a clear message
  // rather than surfacing as a confusing connection error inside the first request.
  void getTestPrisma();

  const builder = Test.createTestingModule({ imports: [AppModule] });
  for (const override of providerOverrides) {
    builder.overrideProvider(override.token).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();

  // Mirrors main.ts exactly. A divergence here would mean the tests exercise a different
  // application from the one that ships, which defeats the purpose of the suite.
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalFilters();
  // The same global pipe main.ts registers. Without it a @Query() DTO never becomes
  // a DTO: the property defaults never run and the raw query object reaches the
  // service, so an omitted `page` arrives as undefined and the database is asked
  // for `skip: NaN`. A test that skips the pipe tests an application nobody ships.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  await app.init();

  return {
    app,
    close: async () => {
      await app.close();
      // PrismaService disconnects itself in onModuleDestroy, but the fixture client
      // outlives the app. disconnectTestPrisma() drops its pooler connections; the
      // per-suite teardown hook in teardown-integration.ts is the backstop.
      await disconnectTestPrisma();
    },
  };
}

/** The canonical health address, used by several assertions. */
export const HEALTH_URL = '/api/v1/health';

/**
 * Joins the Set-Cookie response headers into a Cookie REQUEST header value.
 *
 * Throws when there are none: a spec that builds its cookie from a response that set
 * no cookies has confused its endpoints (register deliberately issues no session -
 * only login does), and failing fast names that mistake instead of producing a
 * cascading 201→401 mystery.
 */
export function cookieFromResponse(response: { headers: Record<string, unknown> }): string {
  const cookies = (response.headers['set-cookie'] ?? []) as unknown[];
  if (cookies.length === 0) {
    throw new Error('Expected Set-Cookie headers (session + CSRF); none were set on this response.');
  }
  return cookies.map((c) => String(c)).join(';');
}

/**
 * Signs in as an account an administrator created, chooses a password, and
 * returns the cookie of the rotated session.
 *
 * A created member is flagged for a forced password change, and until they
 * choose one the service refuses every capability except the change itself
 * (FR-006, FR-028). A test that acts AS that member must therefore choose the
 * password first - exactly as the member would - or it would be testing the
 * password gate instead of what it means to test.
 */
export async function loginAndChangePassword(
  app: INestApplication,
  email: string,
  currentPassword: string,
  newPassword = 'ChangedPassword1234',
): Promise<string> {
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: currentPassword })
    .expect(200);

  const changeRes = await request(app.getHttpServer())
    .post('/api/v1/auth/change-password')
    .set('Cookie', cookieFromResponse(loginRes))
    .send({ currentPassword, newPassword })
    .expect(200);

  return cookieFromResponse(changeRes);
}

/**
 * Signs in an existing account and returns the joined Cookie header.
 *
 * Tests that need an authenticated browser identity register (to materialize the user,
 * membership, and role catalogue) and then log in, exactly as a real client would.
 */
export async function loginForCookies(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return cookieFromResponse(loginRes);
}

