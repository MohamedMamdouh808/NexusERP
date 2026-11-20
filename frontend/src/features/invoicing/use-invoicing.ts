import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createInvoiceFromOrder,
  getInvoice,
  getPayment,
  issueInvoice,
  listInvoices,
  listOpenInvoicesForCustomer,
  listPayments,
  recordPayment,
  reversePayment,
  updateInvoiceDueDate,
  voidInvoice,
} from '../../services/invoicing-client';
import { listSalesOrders } from '../../services/sales-client';
import type {
  CreateInvoiceFromOrderInput,
  InvoiceQuery,
  IssueInvoiceInput,
  PaymentQuery,
  RecordPaymentInput,
  ReversePaymentInput,
  UpdateInvoiceDueDateInput,
  VoidInvoiceInput,
} from '../../services/catalog-service';

/** Turns the client's failure envelope into the error the screens show. */
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

export const invoiceKeys = ['invoices'] as const;
export const paymentKeys = ['payments'] as const;

export function useInvoices(query: InvoiceQuery) {
  return useQuery({
    queryKey: [...invoiceKeys, query],
    queryFn: async () => {
      const result = await listInvoices(query);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: [...invoiceKeys, id],
    enabled: id !== '',
    queryFn: async () => {
      const result = await getInvoice(id);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

/** The candidates the Create Invoice dialog offers: SHIPPED orders, via the real Sales list. */
export interface InvoicableOrderCandidate {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly total: string;
}

export function useInvoicableOrders() {
  return useQuery({
    queryKey: [...invoiceKeys, 'invoicable'],
    queryFn: async (): Promise<readonly InvoicableOrderCandidate[]> => {
      const [result, invoicedOrderIds] = await Promise.all([
        listSalesOrders({
          status: 'SHIPPED',
          page: 1,
          pageSize: 100,
          sortBy: 'number',
          sortOrder: 'asc',
        }),
        listInvoicedOrderIds(),
      ]);
      if (!result.ok) throw toError(result.failure);
      return result.data.items
        .filter((order) => !invoicedOrderIds.has(order.id))
        .map((order) => ({
          orderId: order.id,
          orderNumber: order.number,
          customerId: order.customerId,
          customerName: order.customerName,
          total: order.total,
        }));
    },
  });
}

/**
 * The order ids that already carry a NON-VOID invoice.
 *
 * The service offers no "invoiced" flag on the sales list, and one non-void
 * invoice is the limit per order, so the dialog pages through the invoice list
 * and keeps the non-void rows. A void invoice does not block: its order may be
 * invoiced again. The scan is bounded so a very large organization cannot make
 * the dialog paginate forever; the server still refuses a duplicate.
 */
async function listInvoicedOrderIds(): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();
  for (let page = 1; page <= 50; page += 1) {
    const result = await listInvoices({
      page,
      pageSize: 100,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    });
    if (!result.ok) throw toError(result.failure);
    for (const invoice of result.data.items) {
      if (invoice.status !== 'VOID') ids.add(invoice.orderId);
    }
    if (result.data.items.length < 100) break;
  }
  return ids;
}

/** The order's current non-void invoice, if it has one. A VOID one does not count. */
export function useInvoiceForOrder(orderId: string) {
  return useQuery({
    queryKey: [...invoiceKeys, 'for-order', orderId],
    enabled: orderId !== '',
    queryFn: async () => {
      const result = await listInvoices({
        orderId,
        page: 1,
        pageSize: 100,
        sortBy: 'createdAt',
        sortOrder: 'asc',
      });
      if (!result.ok) throw toError(result.failure);
      return result.data.items.find((invoice) => invoice.status !== 'VOID') ?? null;
    },
  });
}

export function usePayments(query: PaymentQuery) {
  return useQuery({
    queryKey: [...paymentKeys, query],
    queryFn: async () => {
      const result = await listPayments(query);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: [...paymentKeys, id],
    enabled: id !== '',
    queryFn: async () => {
      const result = await getPayment(id);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

/** GET /invoices/open for one customer: ISSUED or PARTIALLY_PAID with a balance above zero. */
export function useOpenInvoices(customerId: string) {
  return useQuery({
    queryKey: [...invoiceKeys, 'open', customerId],
    queryFn: async () => {
      const result = await listOpenInvoicesForCustomer(customerId);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    enabled: customerId !== '',
  });
}

function refresh(client: ReturnType<typeof useQueryClient>) {
  // Issuing, voiding, recording and reversing move balances on both lists;
  // the customer directory is the contacts domain and does not move.
  client.invalidateQueries({ queryKey: invoiceKeys });
  client.invalidateQueries({ queryKey: paymentKeys });
}

export function useCreateInvoice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvoiceFromOrderInput) => {
      const result = await createInvoiceFromOrder(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => refresh(client),
  });
}

export function useIssueInvoice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: IssueInvoiceInput) => {
      const result = await issueInvoice(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => refresh(client),
  });
}

export function useVoidInvoice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: VoidInvoiceInput) => {
      const result = await voidInvoice(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => refresh(client),
  });
}

export function useUpdateInvoiceDueDate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateInvoiceDueDateInput) => {
      const result = await updateInvoiceDueDate(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => refresh(client),
  });
}

export function useRecordPayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordPaymentInput) => {
      const result = await recordPayment(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => refresh(client),
  });
}

export function useReversePayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReversePaymentInput) => {
      const result = await reversePayment(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => refresh(client),
  });
}
