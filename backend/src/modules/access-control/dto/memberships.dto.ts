import { z } from 'zod';

/**
 * Create member request body.
 * The initial password is required and validated unconditionally (FR-008).
 */
export const createMemberSchema = z
  .object({
    email: z.string().email('Invalid email address.'),
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(100, 'Name must be at most 100 characters.')
      .refine((v) => !/[\x00-\x1f\x7f]/.test(v), 'Name must not contain control characters.'),
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
 * Update a member's display name.
 */
export const updateMemberNameSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(100, 'Name must be at most 100 characters.')
      .refine((v) => !/[\x00-\x1f\x7f]/.test(v), 'Name must not contain control characters.'),
    version: z.number().int().positive(),
  })
  .strict();

export type UpdateMemberNameDto = z.infer<typeof updateMemberNameSchema>;

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
