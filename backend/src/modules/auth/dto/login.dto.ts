import { z } from 'zod';

/**
 * Login request body.
 * Returns generic errors that never reveal whether the email exists (FR-010).
 */
export const loginSchema = z
  .object({
    email: z.string().email('Invalid email address.'),
    password: z.string().min(1, 'Password is required.'),
  })
  .strict();

export type LoginDto = z.infer<typeof loginSchema>;
