import type { ReactNode } from 'react';

import { Button } from './button';
import { Input } from './input';
import { Select } from './select';
import type { SelectOption } from './select';
import { formatMoneyGrouped } from '../../lib/format';

/**
 * The line items editor every order document shares (Purchasing, Sales).
 *
 * Extracted at the second occurrence: the grid, the read-only line total, the
 * add/remove handlers and the live order-total panel are one component, so both
 * documents render the same editor. The document-specific parts stay in the
 * parent form: which contacts and warehouses the header offers, whether a line
 * defaults to the purchase or selling price, and — Sales only — the extra
 * read-only availability note rendered beside each line through `renderNote`.
 *
 * A line is plain local strings kept by the parent; totals are always derived
 * here, never typed.
 */
export interface LineEditorLine {
  readonly productId: string;
  readonly quantity: string;
  /** Unit cost (Purchasing) or unit price (Sales), up to 4 decimal places. */
  readonly price: string;
}

/** One editable field of a line. */
export type LineField = 'productId' | 'quantity' | 'price';

export interface LineItemsEditorProps {
  readonly lines: readonly LineEditorLine[];
  readonly productOptions: readonly SelectOption[];
  /** Column label for the price field: "Unit cost" or "Unit price". */
  readonly priceLabel: string;
  readonly quantityHelpText: string;
  readonly priceHelpText: string;
  /** Input id prefix, so labels stay unique per form. */
  readonly idPrefix: string;
  readonly disabled?: boolean;
  /** The form's inline error for one field, shown only where the form says so. */
  readonly fieldError: (index: number, field: LineField) => string | undefined;
  readonly onPickProduct: (index: number, productId: string) => void;
  readonly onChange: (index: number, field: LineField, value: string) => void;
  readonly onBlur: (index: number, field: LineField) => void;
  readonly onAdd: () => void;
  readonly onRemove: (index: number) => void;
  /** Read-only per-line total, or undefined while the inputs are incomplete. */
  readonly lineTotal: (line: LineEditorLine) => string | undefined;
  /** The derived order total. */
  readonly total: string;
  /**
   * An extra read-only cell rendered beside each line, for example the live
   * stock availability a sales document shows. The row gains one column when
   * set, on every row including the header.
   */
  readonly renderNote?: (index: number) => ReactNode;
  readonly noteHeadLabel?: string;
}

export function LineItemsEditor({
  lines,
  productOptions,
  priceLabel,
  quantityHelpText,
  priceHelpText,
  idPrefix,
  disabled = false,
  fieldError,
  onPickProduct,
  onChange,
  onBlur,
  onAdd,
  onRemove,
  lineTotal,
  total,
  renderNote,
  noteHeadLabel = 'Available',
}: LineItemsEditorProps) {
  const noted = renderNote !== undefined;

  return (
    <div className="line-items-editor">
      <div className="line-items-editor__header">
        <h3 className="line-items-editor__title">Line items</h3>
        <Button type="button" variant="default" onClick={onAdd} disabled={disabled}>
          Add line
        </Button>
      </div>

      {lines.length === 0 ? (
        <p className="line-items-editor__empty">No lines yet. Add a product line to order.</p>
      ) : (
        <div>
          <div className={['line-items-editor__line', 'line-items-editor__line--head', noted ? 'line-items-editor__line--with-note' : ''].filter(Boolean).join(' ')} aria-hidden="true">
            <span>Product</span>
            <span>Quantity</span>
            <span>{priceLabel}</span>
            <span>Line total</span>
            {noted && <span>{noteHeadLabel}</span>}
            <span className="sr-only">Remove</span>
          </div>
          {lines.map((line, index) => {
            const rowTotal = lineTotal(line);
            return (
              <div
                key={index}
                className={['line-items-editor__line', noted ? 'line-items-editor__line--with-note' : ''].filter(Boolean).join(' ')}
              >
                <Select
                  id={`${idPrefix}-product-${index}`}
                  label="Product"
                  options={productOptions}
                  value={line.productId}
                  onChange={(event) => onPickProduct(index, event.target.value)}
                  onBlur={() => onBlur(index, 'productId')}
                  error={fieldError(index, 'productId')}
                  placeholder="Select a product"
                />
                <Input
                  id={`${idPrefix}-quantity-${index}`}
                  label="Quantity"
                  error={fieldError(index, 'quantity')}
                  value={line.quantity}
                  onChange={(event) => onChange(index, 'quantity', event.target.value)}
                  onBlur={() => onBlur(index, 'quantity')}
                  required
                  helpText={quantityHelpText}
                />
                <Input
                  id={`${idPrefix}-price-${index}`}
                  label={priceLabel}
                  error={fieldError(index, 'price')}
                  value={line.price}
                  onChange={(event) => onChange(index, 'price', event.target.value)}
                  onBlur={() => onBlur(index, 'price')}
                  required
                  helpText={priceHelpText}
                />
                <div className="line-items-editor__line-total">
                  <span className="form-label">Line total</span>
                  {/* Derived, never typed: quantity x price, half-up to 2 decimals. */}
                  <span className="qty">{rowTotal === undefined ? '—' : formatMoneyGrouped(rowTotal)}</span>
                </div>
                {noted && <div className="line-items-editor__note-cell">{renderNote(index)}</div>}
                <button
                  type="button"
                  className="button line-items-editor__line-remove"
                  onClick={() => onRemove(index)}
                  disabled={disabled}
                  aria-label={`Remove line ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="line-items-editor__totals">
        <span>Order total</span>
        {/* Right aligned, tabular numerals, thousands separators (totals read at a glance). */}
        <strong className="qty">{formatMoneyGrouped(total)}</strong>
      </div>
    </div>
  );
}
