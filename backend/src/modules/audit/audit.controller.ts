import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SessionGuard } from '../../modules/auth/guards/session.guard';
import { AuditService } from './audit.service';
import { getRequestContext } from '../../common/logging/request-context';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation-pipe';

const auditListSchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    userId: z.string().uuid().optional(),
    action: z.string().optional(),
    recordType: z.string().optional(),
    recordId: z.string().uuid().optional(),
    page: z.coerce.number().min(1).optional().default(1),
    pageSize: z.coerce.number().min(1).max(100).optional().default(25),
  })
  .strict();

/**
 * Audit listing endpoint. Requires `audit.read` (FR-020).
 * Scoped by the session's active organization — organization-less entries
 * can never match (FR-020/SC-013).
 */
@Controller('audit-logs')
@UseGuards(SessionGuard)
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @RequirePermission('audit.read')
  async list(
    @Query(new ZodValidationPipe(auditListSchema)) query: z.infer<typeof auditListSchema>,
  ) {
    const ctx = getRequestContext();
    return this.service.list({
      organizationId: ctx?.organizationId ?? '',
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      userId: query.userId,
      action: query.action,
      recordType: query.recordType,
      recordId: query.recordId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
