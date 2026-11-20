import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@nexuserp/shared';

/**
 * Registration request body.
 * Validates email format and enforces minimum password length of 12 characters
 * (FR-009). Passwords are never logged or stored in plain form.
 *
 * The optional organization name and currency let a new workspace start with
 * the right identity (FR-025). The name is trimmed to 1-100 characters, the
 * currency is one of the supported codes (default USD).
 */
export const registerSchema = z
  .object({
    email: z.string().email('Invalid email address.'),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters long.')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
      .regex(/[0-9]/, 'Password must contain at least one digit.'),
    organizationName: z
      .string()
      .trim()
      .min(1, 'Organization name must not be blank.')
      .max(100, 'Organization name must be at most 100 characters long.')
      .optional(),
    currencyCode: z
      .string()
      .refine(
        (code) => SUPPORTED_CURRENCIES.some((supported) => supported === code),
        'Currency must be one of USD, EUR, GBP, EGP, SAR, AED, KWD, QAR, JOD.',
      )
      .optional(),
  })
  .strict();

export type RegisterDto = z.infer<typeof registerSchema>;
