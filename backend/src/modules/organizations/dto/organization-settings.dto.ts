import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@nexuserp/shared';

/**
 * Validation for updating organization settings (P0-F002, Feature 018).
 *
 * Mirrors the shared vocabulary: a trimmed name of 1-100 characters (not
 * unique), a currency from the supported eight codes, and whole payment terms
 * of 0-365 days. The version enables optimistic locking - a stale version is
 * refused as `STALE_VERSION` and must not modify the organization (FR-006).
 */
export const updateOrganizationSettingsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Organization name must not be blank.')
      .max(100, 'Organization name must be at most 100 characters long.'),
    currencyCode: z
      .string()
      .refine(
        (code) => SUPPORTED_CURRENCIES.some((supported) => supported === code),
        'Currency must be one of USD, EUR, GBP, EGP, SAR, AED, KWD, QAR, JOD.',
      ),
    defaultPaymentTermsDays: z
      .coerce.number()
      .int('Payment terms must be a whole number.')
      .min(0, 'Payment terms must be at least 0 days.')
      .max(365, 'Payment terms must be at most 365 days.'),
    version: z.coerce.number().int().min(1, 'Version must be a positive number.'),
  })
  .strict();

export type UpdateOrganizationSettingsInput = z.infer<
  typeof updateOrganizationSettingsSchema
>;
