import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sampleCatalogService } from '../../services/sample-catalog-service';
import type { InvoiceQuery, PaymentQuery, RecordPaymentInput, ReversePaymentInput, VoidInvoiceInput, IssueInvoiceInput, CreateInvoiceFromOrderInput, UpdateInvoiceDueDateInput } from '../../services/catalog-service';

export const invoiceKeys = ['invoices'] as const;
export const paymentKeys = ['payments'] as const;
export function useInvoices(query: InvoiceQuery) { return useQuery({ queryKey: [...invoiceKeys, query], queryFn: () => sampleCatalogService.listInvoices(query) }); }
export function useInvoice(id: string) { return useQuery({ queryKey: [...invoiceKeys, id], queryFn: () => sampleCatalogService.getInvoice(id) }); }
export function useInvoicableOrders() { return useQuery({ queryKey: [...invoiceKeys, 'invoicable'], queryFn: () => sampleCatalogService.listInvoicableOrders() }); }
export function usePayments(query: PaymentQuery) { return useQuery({ queryKey: [...paymentKeys, query], queryFn: () => sampleCatalogService.listPayments(query) }); }
export function usePayment(id: string) { return useQuery({ queryKey: [...paymentKeys, id], queryFn: () => sampleCatalogService.getPayment(id) }); }
export function useOpenInvoiceCustomers() { return useQuery({ queryKey: [...invoiceKeys, 'customers'], queryFn: () => sampleCatalogService.listOpenInvoiceCustomers() }); }
export function useOpenInvoices(customerId: string) { return useQuery({ queryKey: [...invoiceKeys, 'open', customerId], queryFn: () => sampleCatalogService.listOpenInvoicesForCustomer(customerId), enabled: customerId !== '' }); }
function refresh(client: ReturnType<typeof useQueryClient>) { client.invalidateQueries({ queryKey: invoiceKeys }); client.invalidateQueries({ queryKey: paymentKeys }); client.invalidateQueries({ queryKey: ['dashboard'] }); client.invalidateQueries({ queryKey: ['salesOrders'] }); client.invalidateQueries({ queryKey: ['contacts'] }); }
export function useCreateInvoice() { const c = useQueryClient(); return useMutation({ mutationFn: (i: CreateInvoiceFromOrderInput) => sampleCatalogService.createInvoiceFromOrder(i), onSuccess: () => refresh(c) }); }
export function useIssueInvoice() { const c = useQueryClient(); return useMutation({ mutationFn: (i: IssueInvoiceInput) => sampleCatalogService.issueInvoice(i), onSuccess: () => refresh(c) }); }
export function useVoidInvoice() { const c = useQueryClient(); return useMutation({ mutationFn: (i: VoidInvoiceInput) => sampleCatalogService.voidInvoice(i), onSuccess: () => refresh(c) }); }
export function useUpdateInvoiceDueDate() { const c = useQueryClient(); return useMutation({ mutationFn: (i: UpdateInvoiceDueDateInput) => sampleCatalogService.updateInvoiceDueDate(i), onSuccess: () => refresh(c) }); }
export function useRecordPayment() { const c = useQueryClient(); return useMutation({ mutationFn: (i: RecordPaymentInput) => sampleCatalogService.recordPayment(i), onSuccess: () => refresh(c) }); }
export function useReversePayment() { const c = useQueryClient(); return useMutation({ mutationFn: (i: ReversePaymentInput) => sampleCatalogService.reversePayment(i), onSuccess: () => refresh(c) }); }
