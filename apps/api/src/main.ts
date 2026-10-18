import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi/openapi-document';
import { assertPortIsAvailable, loadConfiguration, ConfigurationError } from './config/configuration';
import { NestPinoLogger, createLogger } from './common/logging/logger';

/**
 * Bootstrap.
 *
 * Order is deliberate:
 *   1. Validate configuration and fail fast, naming the cause (FR-009). A service that
 *      starts with an unusable environment and fails later has lost the information about
 *      what was wrong.
 *   2. Check the port is free and fail naming the port, rather than surfacing a bare
 *      EADDRINUSE stack trace.
 *   3. Listen last, so nothing accepts traffic before the above have passed.
 */
async function bootstrap(): Promise<void> {
  let configuration;
  try {
    configuration = loadConfiguration();
  } catch (error) {
    // Printed to stderr as well as thrown: this is the message a developer sees when the
    // container exits, and it must name the variable.
    console.error(error instanceof Error ? error.message : String(error));
    throw error;
  }

  try {
    await assertPortIsAvailable(configuration.port);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger({
    level: configuration.logLevel,
    isProduction: configuration.isProduction,
  });
  const nestLogger = new NestPinoLogger(logger);
  Logger.overrideLogger(nestLogger);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: nestLogger,
  });

  // Trust nothing about the client's address. An explicit proxy setting is required
  // before rate limiting or audit can rely on the remote address, and trusting an
  // unconfigured proxy is how a client spoofs its IP.
  app.set('trust proxy', false);

  // All routes live under the versioned prefix (PRD Section 9.5).
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Explicit allowlist, never a wildcard: a wildcard origin with credentials would let
  // any site issue authenticated requests as the user.
  app.enableCors({
    origin: [...configuration.corsOrigins],
    credentials: true,
  });

  if (!configuration.isProduction) {
    // The human-readable page and the committed contract are generated from the SAME
    // source, so they cannot disagree (FR-042).
    SwaggerModule.setup('api/docs', app, buildOpenApiDocument(app));
  }

  // Close the HTTP server before the process exits, so an in-flight request is not cut
  // off mid-write by a deployment.
  app.enableShutdownHooks();

  await app.listen(configuration.port, '0.0.0.0');
  logger.info(`Service listening on port ${configuration.port}`);
}

void bootstrap().catch((error: unknown) => {
  console.error('Startup failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});