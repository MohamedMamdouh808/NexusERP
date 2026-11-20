import { useTranslation } from 'react-i18next';

import { useState } from 'react';

import { Badge, Button, Dialog, Input, Skeleton } from '../../components/ui';
import { compactQuantity, compareQuantities, formatQuantity } from '../../lib/quantity';
import { usePurchaseOrder, useReceiveGoods } from './use-purchasing';

/**
 * The goods-receipt dialog, openable from the purchase orders list and the
 * order detail page.
 *
 * Two steps. "Enter" shows one row per order line with an editable "Receive
 * now" quantity, a shortcut to fill every outstanding quantity and a review
 * action that stays disabled until at least one quantity is positive. "Confirm"
 * shows exactly what will be posted - the lines, the resulting order status
 * and the consequence - and posting happens only from that step. A posted
 * receipt increases stock immediately, so the confirmation is the last word
 * before the service writes anything.
 *
 * The caller generates the idempotency key when the dialog OPENS and sends it
 * again on a retry, so a retry after a lost answer replays the stored result
 * instead of posting twice. A refusal is shown inline with its request
 * identifier, which the operator can quote against the server log.
 */
export interface ReceiveGoodsDialogProps {
  readonly orderId: string;
  /** Generated when the dialog opens and reused on every retry. */
  readonly idempotencyKey: string;
  readonly onClose: () => void;
  /** Called with the posted GR number so the page can toast it. */
  readonly onPosted: (grNumber: string) => void;
}

interface RowErrors {
  readonly [lineId: string]: string;
}

/** A positive, well-formed quantity? Zero, blank and garbage never count. */
function isPositiveQuantity(value: string): boolean {
  return /^\d+(\.\d{1,3})?$/.test(value) && compareQuantities(value, '0.000') > 0;
}

export function ReceiveGoodsDialog({ orderId, idempotencyKey, onClose, onPosted }: ReceiveGoodsDialogProps) {
  const { t } = useTranslation();
  const { data: order, isPending, isError, error } = usePurchaseOrder(orderId);
  const receiveMutation = useReceiveGoods();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<RowErrors>({});
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [formError, setFormError] = useState('');
  const [requestId, setRequestId] = useState('');

  if (isPending) {
    return (
      <Dialog open onClose={onClose} title={t('purchasing.receive.title')}>
        <Skeleton label={t('purchasing.receive.loading')} />
      </Dialog>
    );
  }

  if (isError || order === undefined) {
    return (
      <Dialog open onClose={onClose} title={t('purchasing.receive.title')}>
        <p className="form-error" role="alert">
          {error instanceof Error ? error.message : t('purchasing.receive.loadError')}
        </p>
      </Dialog>
    );
  }

  function validateLine(value: string, outstanding: string): string | undefined {
    if (value === '') return undefined;
    if (!/^\d+(\.\d{1,3})?$/.test(value)) {
      return t('purchasing.receive.quantityDecimals');
    }
    if (compareQuantities(value, outstanding) > 0) {
      return t('purchasing.receive.exceedsOutstanding', { quantity: formatQuantity(outstanding) });
    }
    return undefined;
  }

  function updateQuantity(lineId: string, value: string, outstanding: string) {
    setQuantities((prev) => ({ ...prev, [lineId]: value }));
    // Live inline error: an entry above the outstanding quantity is refused as typed.
    const rowError = validateLine(value, outstanding);
    setRowErrors((prev) => ({ ...prev, [lineId]: rowError ?? '' }));
  }

  /** The shortcut: every open line gets its full outstanding quantity. */
  function receiveAllOutstanding() {
    if (order === undefined) return;
    const next: Record<string, string> = {};
    for (const line of order.lines) {
      if (compareQuantities(line.outstanding, '0.000') > 0) {
        next[line.id] = line.outstanding;
      }
    }
    setQuantities(next);
    setRowErrors({});
  }

  const entries = order.lines.map((line) => ({
    line,
    fullyReceived: compareQuantities(line.outstanding, '0.000') === 0,
    value: quantities[line.id] ?? '',
    error: rowErrors[line.id] ?? undefined,
  }));

  // Positive quantities entered, one per line at most. Zero rows and garbage
  // never count towards "at least one line receives something".
  const nonZeroRowCount = order.lines.filter((line) => isPositiveQuantity(quantities[line.id] ?? '')).length;
  const anyTypedError = entries.some((entry) => entry.error !== undefined && entry.error !== '');
  const canReview = nonZeroRowCount > 0 && !anyTypedError;

  // Live preview: fully received when every open line ends at zero outstanding.
  const resultingStatus = order.lines.every((line) => {
    const value = quantities[line.id] ?? '0';
    const filled = /^\d+(\.\d{1,3})?$/.test(value) ? value : '0';
    return compareQuantities(line.outstanding, filled) === 0;
  })
    ? 'RECEIVED'
    : 'PARTIALLY_RECEIVED';

  function handleReview() {
    setFormError('');
    setRequestId('');
    setStep('confirm');
  }

  function handleBack() {
    setFormError('');
    setRequestId('');
    setStep('enter');
  }

  function handlePost() {
    setFormError('');
    setRequestId('');

    if (order === undefined || !canReview) return;

    receiveMutation.mutate(
      {
        idempotencyKey,
        orderId: order.id,
        // Every line goes in; zero-quantity lines create nothing.
        lines: order.lines.map((line) => ({
          lineId: line.id,
          productId: line.productId,
          quantity: quantities[line.id] ?? '0.000',
        })),
      },
      {
        onSuccess: (result) => {
          onPosted(result.receipt.number);
          onClose();
        },
        onError: (mutationError) => {
          setFormError(
            mutationError instanceof Error ? mutationError.message : t('purchasing.receive.postError'),
          );
          setRequestId(
            mutationError !== null && typeof mutationError === 'object' && 'requestId' in mutationError
              ? String((mutationError as { requestId: unknown }).requestId)
              : '',
          );
        },
      },
    );
  }

  const summaryLines = order.lines.filter((line) => isPositiveQuantity(quantities[line.id] ?? ''));

  const errorBlock = formError !== '' && (
    <div className="form-error" role="alert">
      <p>{formError}</p>
      {requestId !== '' && <p>{t('purchasing.receive.requestId', { id: requestId })}</p>}
    </div>
  );

  if (step === 'confirm') {
    return (
      <Dialog
        open
        onClose={onClose}
        title={t('purchasing.receive.confirmHeading')}
        actions={
          <>
            <Button type="button" variant="default" onClick={handleBack} disabled={receiveMutation.isPending}>
              {t('purchasing.receive.back')}
            </Button>
            <Button type="button" variant="primary" onClick={handlePost} loading={receiveMutation.isPending}>
              {t('purchasing.receive.post')}
            </Button>
          </>
        }
      >
        <p>
          <span className="mono">{order.number}</span> {t('purchasing.receive.to')} {order.warehouseName}
        </p>
        <ul className="receive-confirm__lines">
          {summaryLines.map((line) => (
            <li key={line.id}>
              <strong>
                {compactQuantity(quantities[line.id] ?? '0')} {line.unitOfMeasure} × {line.productSku}
              </strong>
            </li>
          ))}
        </ul>
        <p className="receive-status-note">
          {t('purchasing.receive.resultingStatus', { status: t(`purchasing.status.${resultingStatus}`) })}
        </p>
        <p className="adjust-consequence">
          {t('purchasing.receive.consequence')}
        </p>
        {errorBlock}
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('purchasing.receive.title')}
      actions={
        <>
          <Button type="button" variant="default" onClick={onClose} disabled={receiveMutation.isPending}>
            {t('purchasing.receive.cancel')}
          </Button>
          <Button type="button" variant="primary" onClick={handleReview} disabled={!canReview || receiveMutation.isPending}>
            {t('purchasing.receive.review')}
          </Button>
        </>
      }
    >
      <p>
        <span className="mono">{order.number}</span>{' '}
        {t('purchasing.receive.from')} {order.supplierName}{' '}
        {t('purchasing.receive.to')} {order.warehouseName}
      </p>
      <div className="receive-lines">
        {entries.map((entry) => (
          <div key={entry.line.id} className="receive-lines__row">
            <div className="receive-lines__product">
              <span className="mono">{entry.line.productSku}</span>
              <span>{entry.line.productName}</span>
              {entry.fullyReceived && <Badge status="RECEIVED">{t('purchasing.receive.fullyReceived')}</Badge>}
            </div>
            <div className="receive-lines figures">
              <span>
                {t('purchasing.receive.ordered')} <strong>{formatQuantity(entry.line.quantity)}</strong>
              </span>
              <span>
                {t('purchasing.receive.alreadyReceived')} <strong>{formatQuantity(entry.line.received)}</strong>
              </span>
              <span>
                {t('purchasing.receive.outstanding')} <strong>{formatQuantity(entry.line.outstanding)}</strong>
              </span>
            </div>
            <Input
              id={`receive-${entry.line.id}`}
              label={t('purchasing.receive.receiveNow')}
              value={entry.value}
              error={entry.error}
              disabled={entry.fullyReceived}
              onChange={(event) => updateQuantity(entry.line.id, event.target.value, entry.line.outstanding)}
              helpText={t('purchasing.receive.receiveNowHelp')}
            />
          </div>
        ))}
      </div>
      <Button type="button" variant="default" onClick={receiveAllOutstanding} disabled={receiveMutation.isPending}>
        {t('purchasing.receive.receiveAllOutstanding')}
      </Button>
      {errorBlock}
      <p className="receive-status-note">
        {t('purchasing.receive.resultingStatus', { status: t(`purchasing.status.${resultingStatus}`) })}
      </p>
      <p className="adjust-consequence">
        {t('purchasing.receive.consequence')}
      </p>
    </Dialog>
  );
}
