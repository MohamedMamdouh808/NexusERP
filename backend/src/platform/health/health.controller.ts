import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/require-permission.decorator';
import { ErrorEnvelopeDto, HealthReportDto } from '../../common/dto/error-envelope.dto';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';
import { HealthService } from './health.service';

/**
 * The health endpoint.
 *
 * Declared `@Public()` EXPLICITLY rather than being public by omission - Constitution
 * Principle II requires default deny, so silence must never mean "allowed".
 *
 * FR-022 requires every failing response to use the standard envelope, and a health
 * endpoint is conventionally a status document. Returning the envelope on failure
 * satisfies both without weakening the contract: HTTP 503 plus `SERVICE_UNAVAILABLE` are
 * the only two signals an infrastructure probe needs, and `details` identifies which
 * check failed without disclosing why.
 */
@ApiTags('Platform')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Report application and database health',
    description:
      'Reports whether the application is serving and whether its database connection is ' +
      'reachable. The checks are reported separately so a failure can be attributed. ' +
      'Never returns a version, hostname, connection string, or driver version, because ' +
      'this endpoint is unauthenticated and a probe response is public information.',
  })
  @ApiOkResponse({
    description: 'The application is serving and the database is reachable.',
    type: HealthReportDto,
  })
  @ApiServiceUnavailableResponse({
    description:
      'At least one check failed. Returned in the standard error envelope so every failing ' +
      'response has the same shape.',
    type: ErrorEnvelopeDto,
  })
  async getHealth(@Res({ passthrough: true }) _response: Response): Promise<HealthReportDto> {
    const report = await this.health.check();

    if (!this.health.isHealthy(report)) {
      // 503 so a load balancer can distinguish a healthy instance from a broken one,
      // and the envelope so an existing client error path handles it with no special case.
      throw new AppException(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        Object.entries(report.checks)
          .filter(([, value]) => value.status !== 'ok')
          .map(([check]) => ({
            field: null,
            code: 'CHECK_FAILED',
            message: `The ${check} check is unavailable.`,
          })),
      );
    }

    return report;
  }
}