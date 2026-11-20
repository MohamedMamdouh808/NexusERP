import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as purchasingClient from '../../services/purchasing-client';
import type {
  CreatePurchaseOrderInput,
  GoodsReceiptQuery,
  PurchaseOrderActionInput,
  PurchaseOrderQuery,
  ReceiveGoodsInput,
  UpdatePurchaseOrderInput,
} from '../../services/catalog-service';

export type {
  CreatePurchaseOrderInput,
  GoodsReceipt,
  GoodsReceiptLine,
  GoodsReceiptPage,
  GoodsReceiptQuery,
  GoodsReceiptRow,
  OrderProgress,
  PurchaseOrder,
  PurchaseOrderActionInput,
  PurchaseOrderActionResult,
  PurchaseOrderLine,
  PurchaseOrderPage,
  PurchaseOrderQuery,
  PurchaseOrderRow,
  PurchaseOrderStatus,
  ReceiveGoodsInput,
  ReceiveGoodsResult,
  UpdatePurchaseOrderInput,
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
  return enriched;
}

/** One page of orders, filtered, searched and sorted as asked. */
export function usePurchaseOrders(query: PurchaseOrderQuery) {
  return useQuery({
    queryKey: ['purchaseOrders', query],
    queryFn: async () => {
      const result = await purchasingClient.listPurchaseOrders(query);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

/** The order itself, its lines and - when the service returns them - the receipt history. */
export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ['purchaseOrders', id],
    queryFn: async () => {
      const result = await purchasingClient.getPurchaseOrder(id);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

/** One page of goods receipts, one row per receipt. */
export function useGoodsReceipts(query: GoodsReceiptQuery, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['goodsReceipts', query],
    queryFn: async () => {
      const result = await purchasingClient.listGoodsReceipts(query);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    enabled: options?.enabled,
  });
}

export function useCreatePurchaseOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePurchaseOrderInput) => {
      const result = await purchasingClient.createPurchaseOrder(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useUpdatePurchaseOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePurchaseOrderInput) => {
      const result = await purchasingClient.updatePurchaseOrder(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useConfirmPurchaseOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: PurchaseOrderActionInput) => {
      const result = await purchasingClient.confirmPurchaseOrder(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

export function useCancelPurchaseOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: PurchaseOrderActionInput) => {
      const result = await purchasingClient.cancelPurchaseOrder(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });
}

/**
 * Posts a receipt.
 *
 * The idempotency key travels WITH the input: the dialog generated it when it
 * opened and passes the same key again on a retry, so a retry after a lost
 * answer replays the stored result instead of posting twice. A receipt changes
 * the order, the receipts list and the Inventory ledger the receipt posted
 * into (balances, movements and the low-stock figure the balance list carries),
 * so every view stays consistent.
 */
export function useReceiveGoods() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReceiveGoodsInput) => {
      const result = await purchasingClient.receiveGoods(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['purchaseOrders'] });
      client.invalidateQueries({ queryKey: ['goodsReceipts'] });
      client.invalidateQueries({ queryKey: ['inventory', 'stockBalances'] });
      client.invalidateQueries({ queryKey: ['inventory', 'movements'] });
    },
  });
}
