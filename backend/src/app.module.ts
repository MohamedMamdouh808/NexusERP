import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { PermissionGuard } from './common/guards/permission.guard';
import { RequestIdMiddleware } from './common/logging/request-id.middleware';
import { ConfigurationModule } from './config/configuration.module';
import { PlatformModule } from './platform/platform.module';

/**
 * The application root.
 *
 * Every cross-cutting concern is registered ONCE here, in a deliberate order:
 *
 *   1. RequestIdMiddleware  - FIRST, as middleware. An interceptor would run after the
 *      guards, so a request rejected by a guard would carry no identifier and its 403
 *      could not be traced (FR-028).
 *   2. PermissionGuard      - registered globally so a new endpoint cannot opt OUT of
 *      authorization by forgetting to register its own guard (Constitution Principle II).
 *   3. AllExceptionsFilter  - registered globally so a new endpoint cannot return a
 *      differently shaped error by forgetting a filter (FR-021).
 *
 * Domain modules are added here one at a time by their own features. This feature adds
 * none (Constitution Principle IX).
 */
@Module({
  imports: [ConfigurationModule, PlatformModule],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}