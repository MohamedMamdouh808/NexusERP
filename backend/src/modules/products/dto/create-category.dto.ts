import { z } from 'zod';

/**
 * Create product category request body.
 *
 * The name is unique within the organization without regard to capitalisation;
 * the service refuses a duplicate and names the category that already holds it.
 */
export const createCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(128, 'Name is too long.'),
  })
  .strict();

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
