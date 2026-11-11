import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { PermissionGuard } from './common/guards/permission.guard';
import { PasswordChangeGuard } from './common/guards/password-change.guard';
import { SessionGuard } from './modules/auth/guards/session.guard';
import { RequestIdMiddleware } from './common/logging/request-id.middleware';
import { ConfigurationModule } from './config/configuration.module';
import { PlatformModule } from './platform/platform.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ProductsModule } from './modules/products/products.module';

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
 * Domain modules are added here one at a time by their own features.
 */
@Module({
  imports: [
    ConfigurationModule,
    PlatformModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    AccessControlModule,
    AuditModule,
    ContactsModule,
    ProductsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // SessionGuard MUST run before PermissionGuard: the permission guard resolves
    // the membership from the request that the session guard binds. Global guards
    // run before controller guards, so registering the session guard only on the
    // controller would leave the permission guard with no membership to resolve.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}