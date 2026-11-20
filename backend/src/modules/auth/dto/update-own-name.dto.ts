import { z } from 'zod';

export const updateOwnNameSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must be at most 100 characters.'),
    version: z.coerce.number().int().min(1),
  })
  .strict();

export type UpdateOwnNameDto = z.infer<typeof updateOwnNameSchema>;
