import { z } from 'zod';

/**
 * Registration request body.
 * Validates email format and enforces minimum password length of 12 characters
 * (FR-009). Passwords are never logged or stored in plain form.
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
  })
  .strict();

export type RegisterDto = z.infer<typeof registerSchema>;
