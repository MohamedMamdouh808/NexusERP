import { z } from 'zod';

/**
 * Create unit of measure request body.
 *
 * The name is unique within the organization without regard to capitalisation;
 * the service refuses a duplicate and names the unit that already holds it.
 */
export const createUnitSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(64, 'Name is too long.'),
    abbreviation: z
      .string()
      .trim()
      .min(1, 'Abbreviation is required.')
      .max(16, 'Abbreviation is too long.'),
  })
  .strict();

export type CreateUnitDto = z.infer<typeof createUnitSchema>;
