import { useState } from 'react';

import { Button, Dialog, Input, Skeleton } from '../../components/ui';
import { compareQuantities, formatQuantity } from '../../lib/quantity';
import { usePurchaseOrder, useReceiveGoods } from './use-purchasing';

/**
 * The goods-receipt dialog, openable from the purchase orders list and the
 * order detail page. One row per order line with an editable "Receive now"
 * quantity; the service receives against an idempotency key the caller
 * generated when the dialog opened, so reopening or retrying never posts twice.
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

export function ReceiveGoodsDialog({ orderId, idempotencyKey, onClose, onPosted }: ReceiveGoodsDialogProps) {
  const { data: order, isPending, isError, error } = usePurchaseOrder(orderId);
  const receiveMutation = useReceiveGoods();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<RowErrors>({});
  const [formError, setFormError] = useState('');

  if (isPending) {
    return (
      <Dialog open onClose={onClose} title="Receive goods">
        <Skeleton label="Loading purchase order" />
      </Dialog>
    );
  }

  if (isError || order === undefined) {
    return (
      <Dialog open onClose={onClose} title="Receive goods">
        <p className="form-error" role="alert">
          {error instanceof Error ? error.message : 'The purchase order could not be loaded.'}
        </p>
      </Dialog>
    );
  }

  function validateLine(value: string, outstanding: string): string | undefined {
    if (value === '') return undefined;
    if (!/^\d+(\.\d{1,3})?$/.test(value)) {
      return 'Enter a quantity of up to 3 decimal places.';
    }
    if (compareQuantities(value, outstanding) > 0) {
      return `Received quantity exceeds the outstanding quantity of ${formatQuantity(outstanding)}.`;
    }
    return undefined;
  }

  function updateQuantity(lineId: string, value: string, outstanding: string) {
    setQuantities((prev) => ({ ...prev, [lineId]: value }));
    // Live inline error: an entry above the outstanding quantity is refused as typed.
    const rowError = validateLine(value, outstanding);
    setRowErrors((prev) => ({ ...prev, [lineId]: rowError ?? '' }));
  }

  const entries = order.lines.map((line) => ({
    line,
    value: quantities[line.id] ?? '',
    error: rowErrors[line.id] ?? undefined,
  }));

  const anyTypedError = entries.some((entry) => entry.error !== undefined && entry.error !== '');
  // Rows with a valid quantity entered above zero; zero rows are never "at least one".
  const nonZeroRowCount = order.lines.filter((line) => {
    const value = quantities[line.id] ?? '';
    return value !== '' && /^\d+(\.\d{1,3})?$/.test(value) && compareQuantities(value, '0.000') > 0;
  }).length;

  // Live preview: fully received when every line ends at zero outstanding.
  const resultingStatus = order.lines.every((line) => {
    const value = quantities[line.id] ?? '0';
    const filled = /^\d+(\.\d{1,3})?$/.test(value) ? value : '0';
    return compareQuantities(line.outstanding, filled) === 0;
  })
    ? 'RECEIVED'
    : 'PARTIALLY_RECEIVED';

  function handlePost() {
    setFormError('');

    if (order === undefined) return;

    if (anyTypedError) {
      setFormError('Correct the marked rows before posting.');
      return;
    }
    if (nonZeroRowCount === 0) {
      setFormError('Enter at least one quantity.');
      return;
    }

    receiveMutation.mutate(
      {
        idempotencyKey,
        orderId: order.id,
        quantities: order.lines.map((line) => ({
          lineId: line.id,
          quantity: quantities[line.id] ?? '0.000',
        })),
      },
      {
        onSuccess: (result) => {
          onPosted(result.number);
          onClose();
        },
        onError: (mutationError) => {
          setFormError(
            mutationError instanceof Error ? mutationError.message : 'The receipt could not be posted.',
          );
        },
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Receive goods"
      actions={
        <>
          <Button type="button" variant="default" onClick={onClose} disabled={receiveMutation.isPending}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handlePost} loading={receiveMutation.isPending}>
            Post receipt
          </Button>
        </>
      }
    >
      <p>
        <span className="mono">{order.number}</span> from {order.supplierName} to {order.warehouseName}
      </p>
      <div className="receive-lines">
        {entries.map((entry) => (
          <div key={entry.line.id} className="receive-lines__row">
            <div className="receive-lines__product">
              <span className="mono">{entry.line.productSku}</span>
              <span>{entry.line.productName}</span>
            </div>
            <div className="receive-lines figures">
              <span>
                Ordered <strong>{formatQuantity(entry.line.quantity)}</strong>
              </span>
              <span>
                Already received <strong>{formatQuantity(entry.line.received)}</strong>
              </span>
              <span>
                Outstanding <strong>{formatQuantity(entry.line.outstanding)}</strong>
              </span>
            </div>
            <Input
              id={`receive-${entry.line.id}`}
              label="Receive now"
              value={entry.value}
              error={entry.error}
              onChange={(event) => updateQuantity(entry.line.id, event.target.value, entry.line.outstanding)}
              helpText="0 or more, up to 3 decimal places. Blank counts as 0."
            />
          </div>
        ))}
      </div>
      {formError !== '' && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <p className="receive-status-note">
        Resulting order status: <strong>{resultingStatus}</strong>
      </p>
      <p className="adjust-consequence">
        Receipts increase stock immediately. A posted receipt cannot be edited or deleted.
      </p>
    </Dialog>
  );
}
