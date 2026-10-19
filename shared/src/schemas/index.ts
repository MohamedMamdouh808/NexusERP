/**
 * Zod schemas shared by the service and the web interface.
 *
 * These are the single validation choke point for both sides. Constitution Principle
 * IV and FR-004 of the specification's decimal rules are made structural here: the
 * decimal schema accepts a STRING and rejects a JavaScript NUMBER, so a monetary or
 * quantity value cannot pass through validation as an IEEE 754 double. A lint rule
 * would be bypassable; a schema type is not.
 */

import { z } from 'zod';
import { ERROR_CODES, REQUEST_ID_PATTERN } from '../errors/index.js';

/**
 * Shown when a caller passes a JavaScript NUMBER where an exact decimal is required.
 *
 * Zod reports a type mismatch before it evaluates the pattern, so without this the
 * developer receives "Expected string, received number" and learns nothing about why
 * the number was refused.
 */
const DECIMAL_TYPE_MESSAGE =
  'Must be a decimal string such as "1250.00". A JavaScript number is not accepted because it cannot represent this value exactly.';

/**
 * An exact decimal value, transported as a string.
 *
 * Money carries two decimal places, unit prices four, and quantities three. Up to four
 * decimal places are accepted so one schema can validate all three kinds; the column
 * precision is enforced by the database and by the schema built on this one.
 *
 * A `number` is rejected outright. `0.1 + 0.2 !== 0.3` in binary floating point, and a
 * total that differs from the server's by a fraction of a unit is indefensible on an
 * invoice a customer will dispute.
 */
export const decimalString = z
  .string({ invalid_type_error: DECIMAL_TYPE_MESSAGE })
  .regex(/^-?\d+(\.\d{1,4})?$/, {
    message:
      'Must be a decimal string such as "1250.00" or "19.9900". A number is not accepted because it loses precision.',
  });

/** A monetary amount: two decimal places. */
export const moneyString = z
  .string({ invalid_type_error: DECIMAL_TYPE_MESSAGE })
  .regex(/^-?\d+(\.\d{1,2})?$/, { message: 'Must be a decimal string with at most 2 decimal places.' });

/** A unit price or unit cost: four decimal places. */
export const unitPriceString = z
  .string({ invalid_type_error: DECIMAL_TYPE_MESSAGE })
  .regex(/^-?\d+(\.\d{1,4})?$/, {
    message: 'Must be a decimal string with at most 4 decimal places.',
  });

/** A quantity: three decimal places. */
export const quantityString = z
  .string({ invalid_type_error: DECIMAL_TYPE_MESSAGE })
  .regex(/^-?\d+(\.\d{1,3})?$/, {
    message: 'Must be a decimal string with at most 3 decimal places.',
  });

/** A request identifier: the strict allowlist that keeps log lines un-forgeable. */
export const requestIdSchema = z.string().regex(REQUEST_ID_PATTERN, {
  message: 'Must be 1-128 characters of A-Z a-z 0-9 . _ -',
});

/** One field-level or check-level detail attached to an error. */
export const errorDetailSchema = z.object({
  field: z.string().nullable(),
  code: z.string().nullable(),
  message: z.string().nullable(),
});

/**
 * The single shape of every failing response.
 *
 * `.strict()` is what enforces "exactly these four fields": an extra key is a
 * validation failure, not a silently tolerated addition.
 */
export const errorEnvelopeSchema = z
  .object({
    code: z.enum(Object.values(ERROR_CODES) as [string, ...string[]]),
    message: z.string().min(1),
    details: z.array(errorDetailSchema),
    requestId: requestIdSchema,
  })
  .strict();

/** Result of one dependency check reported by the health endpoint. */
export const checkResultSchema = z
  .object({
    status: z.enum(['ok', 'unavailable']),
  })
  .strict();

/**
 * The health report returned when the service is healthy.
 *
 * Deliberately narrow: no version, no hostname, no connection string, no driver
 * version, and no exception message (FR-035). An unavailable check reports only THAT
 * it is unavailable; the cause lives in the server log under the request identifier.
 */
export const healthReportSchema = z
  .object({
    status: z.literal('ok'),
    uptimeSeconds: z.number().int().nonnegative(),
    checks: z
      .object({
        application: checkResultSchema,
        database: checkResultSchema.extend({
          latencyMs: z.number().int().nonnegative(),
        }),
      })
      .strict(),
  })
  .strict();

export type DecimalString = z.infer<typeof decimalString>;
export type ErrorDetailSchema = z.infer<typeof errorDetailSchema>;
export type ErrorEnvelopeSchema = z.infer<typeof errorEnvelopeSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;
export type HealthReport = z.infer<typeof healthReportSchema>;