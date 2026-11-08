import { z } from 'zod';

/**
 * Organization switch request body.
 * Requires the caller to be a member of the target organization.
 */
export const switchOrganizationSchema = z
  .object({
    organizationId: z.string().uuid('Invalid organization ID.'),
  })
  .strict();

export type SwitchOrganizationDto = z.infer<typeof switchOrganizationSchema>;
