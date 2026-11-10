import { z } from 'zod';

/**
 * Create member request body.
 * The initial password is required and validated unconditionally (FR-008).
 */
export const createMemberSchema = z
  .object({
    email: z.string().email('Invalid email address.'),
    name: z.string().min(1, 'Name is required.').max(128, 'Name is too long.'),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters long.')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
      .regex(/[0-9]/, 'Password must contain at least one digit.'),
    roleIds: z
      .array(z.string().uuid('Invalid role id.'))
      .min(1, 'At least one role is required.')
      .max(50, 'Too many roles.'),
  })
  .strict();

export type CreateMemberDto = z.infer<typeof createMemberSchema>;

/**
 * Replace roles request body.
 */
export const replaceRolesSchema = z
  .object({
    roleIds: z
      .array(z.string().uuid('Invalid role id.'))
      .min(1, 'At least one role is required.')
      .max(50, 'Too many roles.'),
  })
  .strict();

export type ReplaceRolesDto = z.infer<typeof replaceRolesSchema>;
