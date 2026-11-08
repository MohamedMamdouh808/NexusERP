import { BadRequestException, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Argument-scoped validation pipe for Zod schemas.
 *
 * The DTO contracts are Zod schemas (register, login, switch-organization). This
 * pipe parses the request body against one of them and rejects the request with
 * 400 carrying the Zod issues when it does not conform. Unknown keys are also
 * rejected, because the shared schemas are `.strict()`.
 *
 * Scoped (`@Body(new ZodValidationPipe(schema))`) rather than global on purpose:
 * a global pipe can never know which schema describes the body it receives.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body') return value;

    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed.',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
