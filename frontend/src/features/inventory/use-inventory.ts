import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { sampleCatalogService } from '../../services/sample-catalog-service';
import type {
  CreateWarehouseInput,
  MovementQuery,
  PostAdjustmentInput,
  StockBalanceQuery,
  UpdateWarehouseInput,
} from '../../services/catalog-service';

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: () => sampleCatalogService.listWarehouses(),
  });
}

export function useStockBalances(query: StockBalanceQuery) {
  return useQuery({
    queryKey: ['stockBalances', query],
    queryFn: () => sampleCatalogService.listStockBalances(query),
  });
}

export function useMovements(query: MovementQuery) {
  return useQuery({
    queryKey: ['movements', query],
    queryFn: () => sampleCatalogService.listMovements(query),
  });
}

export function useLowStockCount() {
  return useQuery({
    queryKey: ['lowStockCount'],
    queryFn: () => sampleCatalogService.getLowStockCount(),
  });
}

export function useCreateWarehouse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWarehouseInput) => sampleCatalogService.createWarehouse(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['warehouses'] });
      client.invalidateQueries({ queryKey: ['stockBalances'] });
    },
  });
}

export function useUpdateWarehouse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWarehouseInput) => sampleCatalogService.updateWarehouse(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['warehouses'] });
      client.invalidateQueries({ queryKey: ['stockBalances'] });
    },
  });
}

export function useDeactivateWarehouse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sampleCatalogService.deactivateWarehouse(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['warehouses'] });
      client.invalidateQueries({ queryKey: ['stockBalances'] });
      client.invalidateQueries({ queryKey: ['movements'] });
    },
  });
}

export function usePostAdjustment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PostAdjustmentInput) =>
      sampleCatalogService.postAdjustment(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['stockBalances'] });
      client.invalidateQueries({ queryKey: ['movements'] });
    },
  });
}
