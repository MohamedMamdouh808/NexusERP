import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { sampleCatalogService } from '../../services/sample-catalog-service';
import type {
  CreatePurchaseOrderInput,
  GoodsReceiptQuery,
  PurchaseOrderQuery,
  ReceiveGoodsInput,
  UpdatePurchaseOrderInput,
} from '../../services/catalog-service';

export function usePurchaseOrders(query: PurchaseOrderQuery) {
  return useQuery({
    queryKey: ['purchaseOrders', query],
    queryFn: () => sampleCatalogService.listPurchaseOrders(query),
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ['purchaseOrders', id],
    queryFn: () => sampleCatalogService.getPurchaseOrder(id),
  });
}

export function useGoodsReceipts(query: GoodsReceiptQuery) {
  return useQuery({
    queryKey: ['goodsReceipts', query],
    queryFn: () => sampleCatalogService.listGoodsReceipts(query),
  });
}

export function useCreatePurchaseOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) => sampleCatalogService.createPurchaseOrder(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useUpdatePurchaseOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePurchaseOrderInput) => sampleCatalogService.updatePurchaseOrder(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useConfirmPurchaseOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sampleCatalogService.confirmPurchaseOrder(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useCancelPurchaseOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sampleCatalogService.cancelPurchaseOrder(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useReceiveGoods() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceiveGoodsInput) => sampleCatalogService.receiveGoods(input),
    onSuccess: () => {
      // A receipt changes the order, the receipts list, and the Inventory
      // ledger the receipt posted into, so every view stays consistent.
      client.invalidateQueries({ queryKey: ['purchaseOrders'] });
      client.invalidateQueries({ queryKey: ['goodsReceipts'] });
      client.invalidateQueries({ queryKey: ['movements'] });
      client.invalidateQueries({ queryKey: ['stockBalances'] });
      client.invalidateQueries({ queryKey: ['lowStockCount'] });
    },
  });
}
