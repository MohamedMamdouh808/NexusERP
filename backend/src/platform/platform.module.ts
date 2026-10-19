import { Global, Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { PrismaService } from './prisma/prisma.service';
import { TransactionService } from './transaction/transaction.service';

/**
 * PlatformModule owns infrastructure: the database connection, the transaction unit of
 * work, and the health endpoint (Constitution Principle VI).
 *
 * It owns NO business table. It exposes the database client only through
 * TransactionService, so no domain module can open a connection of its own and quietly
 * step outside the transaction boundary.
 *
 * It is `@Global` because the client is infrastructure every module needs, exactly like
 * a logger. That is different from a shared package: a global module still has an owner,
 * an interface, and a single construction site, whereas a shared domain object would have
 * none of those.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [PrismaService, TransactionService, HealthService],
  exports: [PrismaService, TransactionService, HealthService],
})
export class PlatformModule {}