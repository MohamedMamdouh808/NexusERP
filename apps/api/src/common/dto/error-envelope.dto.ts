import { ApiProperty } from '@nestjs/swagger';
import { ERROR_CODES, type ErrorCode } from '@nexuserp/shared';

/**
 * Response DTOs annotated for OpenAPI generation.
 *
 * FR-027 and FR-043: every endpoint declares its request and response shapes, its error
 * codes, and any header it requires, so a client can be written from the contract alone.
 * These classes are the single source for the contract - the annotations here and the
 * committed `openapi.json` are generated from the same code, so they cannot disagree.
 */

/** One field-level or check-level detail attached to an error. */
export class ErrorDetailDto {
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    description:
      'Dotted path of the offending input field, e.g. `lines.2.quantity`. Null for failures not tied to a field.',
    example: 'lines.2.quantity',
  })
  field!: string | null;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Reason code for this detail.' })
  code!: string | null;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Message for this detail.' })
  message!: string | null;
}

/**
 * The single shape of every failing response.
 *
 * `additionalProperties: false` is the important part: anything else in a failure
 * response is a defect, not an extension point (FR-021).
 */
export class ErrorEnvelopeDto {
  @ApiProperty({
    enum: Object.values(ERROR_CODES),
    description:
      'Stable machine-readable failure code. A code never changes meaning once published, ' +
      'so clients may branch on it rather than on the message text.',
    example: ERROR_CODES.VALIDATION_ERROR,
  })
  code!: ErrorCode;

  @ApiProperty({
    type: String,
    description:
      'Human-readable and safe to display verbatim. Never contains a stack trace, file path, ' +
      'query, hostname, or credential.',
    example: 'Some fields need attention.',
  })
  message!: string;

  @ApiProperty({
    type: [ErrorDetailDto],
    description:
      'Field-level or check-level detail. Always present, an empty array when there is nothing to add.',
  })
  details!: ErrorDetailDto[];

  @ApiProperty({
    type: String,
    description:
      'Identifier for this request, identical to the x-request-id response header, so a ' +
      'user-visible failure can be traced to the server record that explains it.',
    example: '3f6c1d2e-9a4b-4c1f-8e77-2b5d9a0c1e33',
  })
  requestId!: string;
}

/** The result of one dependency check. */
export class CheckResultDto {
  @ApiProperty({
    enum: ['ok', 'unavailable'],
    description:
      'An unavailable check never carries a reason, a message, or an error object. The ' +
      'cause is recorded in the server logs under the request identifier instead.',
    example: 'ok',
  })
  status!: 'ok' | 'unavailable';
}

/** The health report returned when the service is healthy. */
export class HealthReportDto {
  @ApiProperty({ enum: ['ok'], description: 'Present only on a healthy response (HTTP 200).' })
  status!: 'ok';

  @ApiProperty({ type: Number, description: 'Whole seconds since the application started serving.' })
  uptimeSeconds!: number;

  @ApiProperty({
    description: 'Each dependency reported separately, so a failure can be attributed.',
    example: {
      application: { status: 'ok' },
      database: { status: 'ok', latencyMs: 2 },
    },
  })
  checks!: {
    application: CheckResultDto;
    database: CheckResultDto & { latencyMs: number };
  };
}