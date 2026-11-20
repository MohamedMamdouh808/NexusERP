import { z } from 'zod';

/**
 * The ship request.
 *
 * One shipment ships the whole order, so the body carries no quantities and
 * no version: the order row lock, the status check and the per-line
 * active-reservation guard provide concurrency safety (research D8).
 */
export const shipSalesOrderSchema = z.object({}).strict();

export type ShipSalesOrderDto = z.infer<typeof shipSalesOrderSchema>;
