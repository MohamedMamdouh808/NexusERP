import { z } from 'zod';

/**
 * Toggle a module on or off (FR-019). The version is the availability row's
 * version; a stale version is refused as `STALE_VERSION`.
 */
export const toggleModuleSchema = z
  .object({
    enabled: z.boolean(),
    version: z.coerce.number().int().min(1, 'Version must be a positive number.'),
  })
  .strict();

export type ToggleModuleInput = z.infer<typeof toggleModuleSchema>;
