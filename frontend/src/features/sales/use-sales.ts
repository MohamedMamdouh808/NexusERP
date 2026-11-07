import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { sampleCatalogService } from '../../services/sample-catalog-service';
import type {
  ConfirmSalesOrderInput,
  CreateSalesOrderInput,
  SalesOrderQuery,
  ShipSalesOrderInput,
  ShipmentQuery,
  UpdateSalesOrderInput,
} from '../../services/catalog-service';

export function useSalesOrders(query: SalesOrderQuery) {
  return useQuery({
    queryKey: ['salesOrders', query],
    queryFn: () => sampleCatalogService.listSalesOrders(query),
  });
}

export function useSalesOrder(id: string) {
  return useQuery({
    queryKey: ['salesOrders', id],
    queryFn: () => sampleCatalogService.getSalesOrder(id),
  });
}

export function useShipments(query: ShipmentQuery) {
  return useQuery({
    queryKey: ['shipments', query],
    queryFn: () => sampleCatalogService.listShipments(query),
  });
}

export function useCreateSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSalesOrderInput) => sampleCatalogService.createSalesOrder(input),
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
    mutationFn: (input: UpdateSalesOrderInput) => sampleCatalogService.updateSalesOrder(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['salesOrders'] });
    },
  });
}

export function useConfirmSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmSalesOrderInput) => sampleCatalogService.confirmSalesOrder(input),
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
    mutationFn: (id: string) => sampleCatalogService.cancelSalesOrder(id),
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
    mutationFn: (input: ShipSalesOrderInput) => sampleCatalogService.shipSalesOrder(input),
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
