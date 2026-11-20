import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as inventoryClient from '../../services/inventory-client';
import type {
  CreateWarehouseInput,
  ListStockBalancesParams,
  ListStockMovementsParams,
  PostAdjustmentInput,
  UpdateWarehouseInput,
  WarehouseStateInput,
} from '../../services/inventory-client';

export type {
  AdjustmentReason,
  CreateWarehouseInput,
  InventoryWarehouse,
  ListStockBalancesParams,
  ListStockMovementsParams,
  MovementType,
  PostAdjustmentInput,
  StockBalanceListResponse,
  StockBalanceRow,
  StockMovementListResponse,
  StockMovementRow,
  UpdateWarehouseInput,
  WarehouseStateInput,
} from '../../services/inventory-client';

/** Turns the service's failure envelope into the error the screens show. */
function toError(failure: { code: string; message: string; requestId: string; status?: number; details?: unknown }): Error {
  const error = new Error(failure.message);
  const enriched = error as Error & { code?: string; requestId?: string; status?: number; details?: unknown };
  enriched.code = failure.code;
  enriched.requestId = failure.requestId;
  enriched.status = failure.status;
  enriched.details = failure.details;
  return enriched;
}

/** The organization's warehouses. */
export function useWarehouses() {
  return useQuery({
    queryKey: ['inventory', 'warehouses'],
    queryFn: async () => {
      const result = await inventoryClient.listWarehouses();
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

/** One page of balances, in whichever of the three selections the params name. */
export function useStockBalances(params: ListStockBalancesParams) {
  return useQuery({
    queryKey: ['inventory', 'stockBalances', params],
    queryFn: async () => {
      const result = await inventoryClient.listStockBalances(params);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

/**
 * How many archived products still hold stock, for the hint.
 *
 * A one-row page is enough: the total counts the whole selection. The hint asks
 * for it whenever the archived filter is off, so leftover stock is never
 * silently invisible.
 */
export function useArchivedWithStockCount(enabled: boolean) {
  return useQuery({
    queryKey: ['inventory', 'archivedWithStockCount'],
    queryFn: async () => {
      const result = await inventoryClient.listStockBalances({
        status: 'archivedWithStock',
        page: 1,
        pageSize: 1,
      });
      if (!result.ok) throw toError(result.failure);
      return result.data.total;
    },
    enabled,
  });
}

/** One page of the movement ledger. */
export function useMovements(params: ListStockMovementsParams) {
  return useQuery({
    queryKey: ['inventory', 'movements', params],
    queryFn: async () => {
      const result = await inventoryClient.listStockMovements(params);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

export function useCreateWarehouse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWarehouseInput) => {
      const result = await inventoryClient.createWarehouse(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['inventory', 'warehouses'] });
    },
  });
}

export function useUpdateWarehouse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateWarehouseInput) => {
      const result = await inventoryClient.updateWarehouse(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['inventory', 'warehouses'] });
    },
  });
}

export function useDeactivateWarehouse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: WarehouseStateInput) => {
      const result = await inventoryClient.deactivateWarehouse(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['inventory', 'warehouses'] });
      client.invalidateQueries({ queryKey: ['inventory', 'stockBalances'] });
      client.invalidateQueries({ queryKey: ['inventory', 'movements'] });
    },
  });
}

export function useReactivateWarehouse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: WarehouseStateInput) => {
      const result = await inventoryClient.reactivateWarehouse(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['inventory', 'warehouses'] });
      client.invalidateQueries({ queryKey: ['inventory', 'movements'] });
    },
  });
}

/**
 * Posts an adjustment.
 *
 * The idempotency key travels WITH the input: the dialog generated it when it
 * opened and passes the same key again on a retry, so a retry after a lost
 * answer replays the stored result instead of posting twice.
 */
export function usePostAdjustment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: PostAdjustmentInput) => {
      const result = await inventoryClient.postAdjustment(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['inventory', 'stockBalances'] });
      client.invalidateQueries({ queryKey: ['inventory', 'movements'] });
      client.invalidateQueries({ queryKey: ['inventory', 'archivedWithStockCount'] });
    },
  });
}
