/**
 * Per-suite setup + teardown for integration tests.
 *
 * Timeout: hook work here provisions and resets a REMOTE PostgreSQL schema (60-90s
 * per operation against Supabase). Jest's 30s default kills hooks mid-seed, leaving
 * half-finished state that breaks the next test - not a code defect. jest.setTimeout
 * is not a per-project config option, so the integration project sets it here.
 */
jest.setTimeout(120_000);

/**
 * Jest resets the module registry between spec files, so every suite constructs a fresh
 * fixture Prisma client (`getTestPrisma()`) plus a fresh application `PrismaService`. A
 * suite that only closes its app leaves the fixture client's pooler connections behind.
 * The remote pooler enforces a hard session-mode cap (15 clients), so enough suites leak
 * two clients each and the next suite's TRUNCATE dies with `EMAXCONNSESSION` - not an
 * assertion failure, just leaked sockets.
 *
 * This hook runs for every integration suite (registered before each spec file's own
 * afterAll hooks, so jest runs it LAST) and drops the fixture client. The application
 * client is already disconnected by `app.close()` -> `PrismaService.onModuleDestroy`.
 */
afterAll(async () => {
  const { disconnectTestPrisma } = await import('./fixtures/database');
  await disconnectTestPrisma();
});
