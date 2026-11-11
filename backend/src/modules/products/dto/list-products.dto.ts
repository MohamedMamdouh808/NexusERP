import { z } from 'zod';
import { PRODUCT_LIST_DEFAULTS } from '@nexuserp/shared';

/**
 * List products query.
 *
 * The status filter defaults to the active products, and the page size is
 * capped: a catalogue of ten thousand products is served a page at a time.
 */
export const listProductsSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    categoryId: z.string().uuid('Invalid category id.').optional(),
    status: z.enum(['all', 'active', 'archived']).default(PRODUCT_LIST_DEFAULTS.status),
    page: z.coerce.number().int().min(1).default(PRODUCT_LIST_DEFAULTS.page),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(PRODUCT_LIST_DEFAULTS.maxPageSize)
      .default(PRODUCT_LIST_DEFAULTS.pageSize),
    sortBy: z.enum(['name', 'sku', 'createdAt']).default(PRODUCT_LIST_DEFAULTS.sortBy),
    sortOrder: z.enum(['asc', 'desc']).default(PRODUCT_LIST_DEFAULTS.sortOrder),
  })
  .strict();

export type ListProductsDto = z.infer<typeof listProductsSchema>;
