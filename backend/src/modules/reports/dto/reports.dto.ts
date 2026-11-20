import { z } from 'zod';

export const reportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  direction: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const stockOnHandQuerySchema = z.object({
  search: z.string().optional(),
  warehouseId: z.string().uuid().optional(),
  includeArchived: z.coerce.boolean().optional().default(false),
  sort: z.enum(['productName', 'onHand', 'reserved', 'available']).optional().default('productName'),
  direction: z.enum(['asc', 'desc']).optional().default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const stockMovementsQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  type: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  sort: z.enum(['createdAt', 'quantity', 'type']).optional().default('createdAt'),
  direction: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const outstandingInvoicesQuerySchema = z.object({
  search: z.string().optional(),
  overdueOnly: z.coerce.boolean().optional().default(false),
  dueFrom: z.string().optional(),
  dueTo: z.string().optional(),
  sort: z.enum(['number', 'issueDate', 'dueDate', 'balance', 'customer']).optional().default('dueDate'),
  direction: z.enum(['asc', 'desc']).optional().default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const documentStatusesQuerySchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});

export type StockOnHandQuery = z.infer<typeof stockOnHandQuerySchema>;
export type StockMovementsQuery = z.infer<typeof stockMovementsQuerySchema>;
export type OutstandingInvoicesQuery = z.infer<typeof outstandingInvoicesQuerySchema>;
export type DocumentStatusesQuery = z.infer<typeof documentStatusesQuerySchema>;