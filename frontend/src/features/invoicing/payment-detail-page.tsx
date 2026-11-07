import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/shell/page-header';
import { Badge, Button, Card, Dialog, ErrorState, Skeleton, Textarea, Toast } from '../../components/ui';
import type { ToastTone } from '../../components/ui';
import { formatMoneyGrouped } from '../../lib/format';
import { usePayment, useReversePayment } from './use-invoicing';
import { DocumentTrail } from '../../components/ui/document-trail';

const key = () => globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}`;
export function PaymentDetailPage() {
  const { id = '' } = useParams(); const location = useLocation(); const navigate = useNavigate(); const query = usePayment(id); const reverse = useReversePayment(); const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [idem, setIdem] = useState(''); const [toasts, setToasts] = useState<{id:string;tone:ToastTone;message:string}[]>([]); const noticeConsumed = useRef(false);
  useEffect(() => { const state = location.state; if (noticeConsumed.current || !state || typeof state !== 'object' || !('notice' in state)) return; noticeConsumed.current = true; setToasts((items) => [...items, { id: `payment-created-${Date.now()}`, tone: 'success', message: String((state as { notice: unknown }).notice) }]); navigate(location.pathname, { replace: true }); }, [location.state, location.pathname, navigate]);
  if (query.isPending) return <section><PageHeader title="Payment"/><div className="sample-banner">Sample data</div><Card title="Payment"><Skeleton label="Loading payment"/></Card></section>;
  if (query.isError || !query.data) return <section><PageHeader title="Payment"/><div className="sample-banner">Sample data</div><Card title="Payment"><ErrorState message="Payment could not be loaded." onRetry={() => void query.refetch()}/></Card></section>;
  const payment = query.data;
  function toast(message: string) { setToasts((items) => [...items, { id: `payment-toast-${Date.now()}`, tone: 'success', message }]); }
  return <section className="payment-detail"><PageHeader title={payment.number} description="Payments are permanent records." primaryAction={<div className="invoice-header-actions"><Badge status={payment.status}>{payment.status}</Badge>{payment.status === 'RECORDED' && <Button variant="danger" onClick={() => { setError(''); setReason(''); setIdem(key()); setOpen(true); }}>Reverse payment</Button>}</div>}/><div className="sample-banner">Sample data</div>
    <Card title="Payment summary"><dl className="invoice-details-grid"><dt>Customer</dt><dd>{payment.customerName}</dd><dt>Date</dt><dd>{payment.date}</dd><dt>Method</dt><dd>{payment.method}</dd><dt>Amount</dt><dd className="numeric-cell">{formatMoneyGrouped(payment.amount)}</dd><dt>Reference</dt><dd>{payment.reference || '—'}</dd></dl></Card>
    <Card title="Allocations"><div className="table-container"><table className="data-table"><thead><tr><th>Invoice</th><th className="numeric-cell">Amount allocated</th></tr></thead><tbody>{payment.allocations.map((allocation) => <tr key={allocation.invoiceId}><td><Link className="doc-number" to={`/invoicing/${allocation.invoiceId}`}>{allocation.invoiceNumber ?? 'Draft invoice'}</Link></td><td className="numeric-cell">{formatMoneyGrouped(allocation.amount)}</td></tr>)}</tbody></table></div></Card>
    <DocumentTrail recordType="Payment" recordNumber={payment.number} />
    {payment.status === 'REVERSED' && <Card title="Reversal"><p>{payment.reversalReason}</p><p>Reversed {payment.reversedDate}</p><p>Reversal of {payment.number}</p></Card>}
    <Dialog open={open} onClose={() => setOpen(false)} title="Reverse payment?" actions={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={reverse.isPending} disabled={reverse.isPending} onClick={() => { if (!reason.trim()) { setError('A reason is required.'); return; } reverse.mutate({ paymentId: payment.id, reason, idempotencyKey: idem }, { onSuccess: (result) => { setOpen(false); toast(`${result.number} reversed`); void query.refetch(); }, onError: (e) => setError(e instanceof Error ? e.message : 'Payment has already been reversed.') }); }}>Reverse payment</Button></>}>
      <p>The payment stays in history marked REVERSED, and invoice balances and statuses return to their state before it.</p><Textarea id="reverse-reason" label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={error}/>
    </Dialog>
    {toasts.map((t) => <Toast key={t.id} id={t.id} tone={t.tone} message={t.message} onDismiss={() => setToasts((items) => items.filter((v) => v.id !== t.id))}/>)}
  </section>;
}
