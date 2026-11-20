import { z } from 'zod';

/**
 * The warehouse requests.
 *
 * A warehouse's NAME is its identity: there is no code. The name is unique
 * inside the organization without regard to capitalisation, and the version the
 * caller read travels with every change so two administrators cannot overwrite
 * each other.
 */
export const createWarehouseSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(100, 'Name is too long.'),
    isDefault: z.boolean().default(false),
  })
  .strict();

export const updateWarehouseSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(100, 'Name is too long.'),
    isDefault: z.boolean().default(false),
    version: z.coerce.number().int().min(1, 'Version is required.'),
  })
  .strict();

/** A deactivate or reactivate carries only the version it read. */
export const warehouseStateSchema = z
  .object({
    version: z.coerce.number().int().min(1, 'Version is required.'),
  })
  .strict();

export type CreateWarehouseDto = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseDto = z.infer<typeof updateWarehouseSchema>;
export type WarehouseStateDto = z.infer<typeof warehouseStateSchema>;
