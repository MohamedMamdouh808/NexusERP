import { z } from 'zod';

/**
 * Create/update custom role request body.
 * The permission set is open (any catalogue permission) but subject to the
 * no-escalation subset rule (FR-031).
 */
export const roleSchema = z
  .object({
    name: z.string().min(1, 'Name is required.').max(128, 'Name is too long.'),
    key: z.string().min(1, 'Key is required.').max(64, 'Key is too long.'),
    description: z.string().max(255, 'Description is too long.').optional().nullable(),
    permissionCodes: z
      .array(z.string().min(1, 'Permission code cannot be empty.'))
      .min(1, 'At least one permission is required.')
      .max(100, 'Too many permissions.'),
  })
  .strict();

export type RoleDto = z.infer<typeof roleSchema>;
