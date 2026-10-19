import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  DEFAULT_ERROR_MESSAGES,
  ERROR_CODES,
  ERROR_CODE_STATUS,
  type ErrorCode,
  type ErrorDetail,
} from '@nexuserp/shared';
import type { Response } from 'express';
import { getRequestId } from '../logging/request-context';

/**
 * The single place a failing response is produced.
 *
 * FR-021 and FR-022: EVERY failure - validation, authentication, authorization, missing
 * record, conflict, rate limit, and anything unexpected - returns exactly
 * `{ code, message, details, requestId }`. Making one component responsible for the
 * shape is the only reliable way to guarantee it; per-endpoint filters are exactly the
 * inconsistency the requirement forbids.
 *
 * FR-026: an unexpected failure returns a fixed message containing no stack trace, file
 * path, query, or internal detail. The original error is logged under the request
 * identifier and never returned. The identifier alone is enough to find the full record,
 * which is what makes the message safe to display verbatim.
 */

/** An application-thrown failure carrying an explicit code. */
export class AppException extends HttpException {
  readonly errorCode: ErrorCode;
  readonly details: readonly ErrorDetail[];

  constructor(errorCode: ErrorCode, details: readonly ErrorDetail[] = [], message?: string) {
    const status = ERROR_CODE_STATUS[errorCode];
    super(message ?? DEFAULT_ERROR_MESSAGES[errorCode], status);
    this.errorCode = errorCode;
    this.details = details;
  }
}

/**
 * Maps a validation failure onto `details` entries carrying a dotted field path.
 *
 * FR-024: a form must be able to render the message under the offending control, so the
 * path must identify the field. Nested paths use dots, e.g. `lines.2.quantity`.
 */
function toValidationDetails(exception: HttpException): ErrorDetail[] {
  const response = exception.getResponse();
  if (typeof response !== 'object' || response === null) return [];

  const candidate = response as { message?: unknown };
  if (typeof candidate.message !== 'string' && !Array.isArray(candidate.message)) return [];

  const messages = Array.isArray(candidate.message) ? candidate.message : [candidate.message];

  return messages.map((raw) => {
    const text = String(raw);
    // NestJS validation messages begin with the property path; split it off so the
    // message a user reads does not repeat a technical path.
    const separator = text.indexOf(' ');
    const path = separator === -1 ? '' : text.slice(0, separator);
    const message = separator === -1 ? text : text.slice(separator + 1);
    return {
      field: path.length > 0 ? path : null,
      code: 'VALIDATION_ERROR',
      message: message.length > 0 ? message : DEFAULT_ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR],
    };
  });
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const requestId = getRequestId() ?? 'unknown';

    const { status, code, message, details } = this.classify(exception);

    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      // The stack lives here and ONLY here (FR-040). It is never returned.
      const request = http.getRequest<{ url?: string }>();
      this.logger.error(
        `${code} ${status} on ${request?.url ?? 'unknown route'}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // FR-031: the user-visible message carries the identifier so a user can quote it.
    const finalMessage =
      code === ERROR_CODES.INTERNAL_ERROR
        ? DEFAULT_ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR].replace('{requestId}', requestId)
        : message;

    response.status(status).json({ code, message: finalMessage, details, requestId });
  }

  /** Maps any thrown value onto the catalogued envelope. */
  private classify(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details: readonly ErrorDetail[];
  } {
    if (exception instanceof AppException) {
      return {
        status: ERROR_CODE_STATUS[exception.errorCode],
        code: exception.errorCode,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const details = toValidationDetails(exception);
      const code = this.codeForStatus(status);

      if (code === ERROR_CODES.VALIDATION_ERROR && details.length > 0) {
        return {
          status,
          code,
          message: DEFAULT_ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR],
          details,
        };
      }

      return { status, code, message: this.safeMessage(exception, code), details };
    }

    // Anything unrecognised: a fixed message, the cause recorded under the identifier.
    return {
      status: ERROR_CODE_STATUS[ERROR_CODES.INTERNAL_ERROR],
      code: ERROR_CODES.INTERNAL_ERROR,
      message: DEFAULT_ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR],
      details: [],
    };
  }

  /** Chooses the catalogued code that matches an HTTP status. */
  private codeForStatus(status: HttpStatus): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.METHOD_NOT_ALLOWED:
        return ERROR_CODES.METHOD_NOT_ALLOWED;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.CONFLICT;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ERROR_CODES.PAYLOAD_TOO_LARGE;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ERROR_CODES.VALIDATION_FAILED;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.TOO_MANY_REQUESTS;
      case HttpStatus.NOT_IMPLEMENTED:
        return ERROR_CODES.NOT_IMPLEMENTED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ERROR_CODES.SERVICE_UNAVAILABLE;
      default:
        return status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? ERROR_CODES.INTERNAL_ERROR
          : ERROR_CODES.CONFLICT;
    }
  }

  /**
   * Returns a message that is safe to send.
   *
   * A handler may have set a deliberate message (an `AppException` does), but an
   * arbitrary thrown message is not trusted: it could contain a query or a path. Only the
   * catalogued default is used unless the exception is one of ours.
   */
  private safeMessage(_exception: HttpException, code: ErrorCode): string {
    return DEFAULT_ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR];
  }
}