import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  getSalesOrder,
  listSalesOrders,
  listShipments,
  shipSalesOrder,
  updateSalesOrder,
} from '../../services/sales-client';
import type {
  ConfirmSalesOrderInput,
  CreateSalesOrderInput,
  CancelSalesOrderInput,
  SalesOrderQuery,
  ShipSalesOrderInput,
  ShipmentQuery,
  UpdateSalesOrderInput,
} from '../../services/catalog-service';

/** Turns the service's failure envelope into the error the screens show. */
function toError(failure: {
  code: string;
  message: string;
  requestId: string;
  status?: number;
  details?: unknown;
}): Error {
  const error = new Error(failure.message);
  const enriched = error as Error & {
    code?: string;
    requestId?: string;
    status?: number;
    details?: unknown;
  };
  enriched.code = failure.code;
  enriched.requestId = failure.requestId;
  enriched.status = failure.status;
  enriched.details = failure.details;
  return error;
}

export function useSalesOrders(query: SalesOrderQuery) {
  return useQuery({
    queryKey: ['salesOrders', query],
    queryFn: async () => {
      const result = await listSalesOrders(query);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

export function useSalesOrder(id: string) {
  return useQuery({
    queryKey: ['salesOrders', id],
    queryFn: async () => {
      const result = await getSalesOrder(id);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

export function useShipments(query: ShipmentQuery) {
  return useQuery({
    queryKey: ['shipments', query],
    queryFn: async () => {
      const result = await listShipments(query);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

export function useCreateSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSalesOrderInput) => {
      const result = await createSalesOrder(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['salesOrders'] });
      // The Overview counts orders by status, and a new draft is one.
      client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSalesOrderInput) => {
      const result = await updateSalesOrder(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['salesOrders'] });
    },
  });
}

export function useConfirmSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConfirmSalesOrderInput) => {
      const result = await confirmSalesOrder(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      // Confirming reserves stock: the sales order, the Overview's active
      // orders and status breakdown, and Inventory's Reserved and Available
      // all move together.
      client.invalidateQueries({ queryKey: ['salesOrders'] });
      client.invalidateQueries({ queryKey: ['dashboard'] });
      client.invalidateQueries({ queryKey: ['stockBalances'] });
      client.invalidateQueries({ queryKey: ['lowStockCount'] });
    },
  });
}

export function useCancelSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CancelSalesOrderInput) => {
      const result = await cancelSalesOrder(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      // Cancelling a confirmed order releases its reservations, so Inventory
      // changes too; the Overview's status counts move for every status.
      client.invalidateQueries({ queryKey: ['salesOrders'] });
      client.invalidateQueries({ queryKey: ['dashboard'] });
      client.invalidateQueries({ queryKey: ['stockBalances'] });
      client.invalidateQueries({ queryKey: ['lowStockCount'] });
    },
  });
}

export function useShipSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ShipSalesOrderInput) => {
      const result = await shipSalesOrder(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      // Shipping deducts stock and posts SHIPMENT movements, so the Inventory
      // screens and the shipments table change with the order.
      client.invalidateQueries({ queryKey: ['salesOrders'] });
      client.invalidateQueries({ queryKey: ['shipments'] });
      client.invalidateQueries({ queryKey: ['dashboard'] });
      client.invalidateQueries({ queryKey: ['movements'] });
      client.invalidateQueries({ queryKey: ['stockBalances'] });
      client.invalidateQueries({ queryKey: ['lowStockCount'] });
    },
  });
}
