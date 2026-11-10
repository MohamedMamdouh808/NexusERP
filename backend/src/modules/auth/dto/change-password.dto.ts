import { z } from 'zod';

/**
 * Change-own-password request body.
 * The new password follows the registration policy, differs from the current
 * password, and is not the user's email (FR-026).
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: z
      .string()
      .min(12, 'New password must be at least 12 characters long.')
      .regex(/[A-Z]/, 'New password must contain at least one uppercase letter.')
      .regex(/[a-z]/, 'New password must contain at least one lowercase letter.')
      .regex(/[0-9]/, 'New password must contain at least one digit.'),
  })
  .strict()
  .refine(
    (data) => data.newPassword !== data.currentPassword,
    {
      path: ['newPassword'],
      message: 'New password must differ from the current password.',
    },
  );

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
