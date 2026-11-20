import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import {
  getPerformanceContext,
  isPerformanceInstrumentationEnabled,
} from '../../common/logging/request-context';

/**
 * Emits the per-request performance headers (Feature 019, contracts/instrumentation.md).
 *
 * The counters live on the request context and are incremented by the Prisma query
 * event hook. The interceptor only reads them once, at the end of the request:
 *
 *   Server-Timing: db;dur=12.3, app;dur=4.1
 *   X-Query-Count: 7
 *
 * `db` is the sum of the durations Prisma reported; `app` is everything else (the
 * total request time minus the database time), so the two never double-count.
 *
 * In production both headers are omitted unless `PERF_INSTRUMENTATION=1`. The
 * counters are still collected because a single integer add per query is cheaper
 * than the condition that would skip it, and the query-count budget tests need it.
 */
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<'http'>() !== 'http') {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      finalize(() => {
        const performanceContext = getPerformanceContext();
        if (!performanceContext || response.headersSent) return;

        if (!isPerformanceInstrumentationEnabled()) return;

        const totalMs = Math.max(
          0,
          performance.now() - performanceContext.startedAt,
        );
        const dbMs = Math.max(0, performanceContext.dbTimeMs);
        const appMs = Math.max(0, totalMs - dbMs);

        response.setHeader(
          'Server-Timing',
          `db;dur=${dbMs.toFixed(1)}, app;dur=${appMs.toFixed(1)}`,
        );
        response.setHeader('X-Query-Count', String(performanceContext.queryCount));
      }),
    );
  }
}
