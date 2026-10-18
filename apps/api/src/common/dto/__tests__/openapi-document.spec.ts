import { SwaggerModule, DocumentBuilder, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../app.module';

// Configuration is validated when the module graph is compiled, so the document
// test must supply a well-formed environment before it can reach the Swagger
// generator. Nothing here connects: compile() does not call onModuleInit.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://nexuserp:nexuserp@127.0.0.1:5432/nexuserp';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'unit-test-session-secret';
process.env.CSRF_SECRET = process.env.CSRF_SECRET ?? 'unit-test-csrf-secret';

/**
 * Builds the REAL OpenAPI document from the REAL application module.
 *
 * Why this exists (FR-044, and the bug it pins):
 *
 * `HealthReportDto.checks` was originally typed with an inline intersection,
 * `CheckResultDto & { latencyMs: number }`. TypeScript accepted it, `tsc` was
 * clean, every unit and integration test passed, and the application served
 * requests correctly. The defect was invisible until the moment
 * `SwaggerModule.createDocument` walked the schema and threw:
 *
 *   A circular dependency has been detected (property key: "checks").
 *   Please remove the circular references or use the 'type' function.
 *
 * That is a boot-time failure on a code path no other test touched. This test
 * closes the gap: it builds the document without listening on a port, so any
 * future circular or otherwise unresolvable DTO reference fails the suite here
 * rather than at deploy time.
 *
 * `compile()` resolves the dependency graph but does NOT call `onModuleInit`,
 * so no database connection is opened. That keeps this a unit test.
 */
describe('OpenAPI document', () => {
  let app: INestApplication | undefined;

  async function build(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const application = moduleRef.createNestApplication();
    // Mirrors src/main.ts so the document under test matches what is served.
    application.setGlobalPrefix('api/v1');
    return application;
  }

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('builds without a circular dependency error', async () => {
    app = await build();

    let document: OpenAPIObject | undefined;
    const ready = app;
    expect(() => {
      document = SwaggerModule.createDocument(
        ready,
        new DocumentBuilder().setTitle('NexusERP API').setVersion('1.0').build(),
      );
    }).not.toThrow();
    expect(document).toBeDefined();
  });

  it('documents the health endpoint with its response envelope', async () => {
    app = await build();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('NexusERP API').setVersion('1.0').build(),
    ) as unknown as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };

    expect(Object.keys(document.paths)).toContain('/api/v1/health');
    expect(document.components.schemas).toHaveProperty('HealthReportDto');
    expect(document.components.schemas).toHaveProperty('ErrorEnvelopeDto');
  });

  it('resolves the checks property to a named schema, not an inline cycle', async () => {
    app = await build();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('NexusERP API').setVersion('1.0').build(),
    ) as unknown as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };

    const report = document.components.schemas['HealthReportDto'];
    expect(report?.properties?.['checks']).toBeDefined();
    // A reference proves the generator emitted a link to a named schema instead
    // of inlining the intersection type and walking back into itself. Nest/Swagger
    // wraps a `type: () => X` property in `allOf`, so accept either shape.
    const checks = report?.properties?.['checks'] as
      | { $ref?: string; allOf?: { $ref?: string }[] }
      | undefined;
    const ref = checks?.$ref ?? checks?.allOf?.[0]?.$ref;
    expect(ref).toBe('#/components/schemas/DependencyChecksDto');
  });
});