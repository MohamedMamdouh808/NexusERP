import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from './button';
import { Input } from './input';
import { Select } from './select';
import type { SelectOption } from './select';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';

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
   * set.
   */
  readonly renderNote?: (index: number) => ReactNode;
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
}: LineItemsEditorProps) {
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();

  // Resolve a row's note once: a null note means the cell does not exist for
  // that row (for example, no warehouse chosen yet), not that it is empty.
  const noteFor = (index: number): ReactNode => renderNote?.(index) ?? null;

  return (
    <div className="line-items-editor">
      <div className="line-items-editor__header">
        <h3 className="line-items-editor__title">{t('ui.lineItems.title')}</h3>
        <Button type="button" variant="default" onClick={onAdd} disabled={disabled}>
          {t('ui.lineItems.addLine')}
        </Button>
      </div>

      {lines.length === 0 ? (
        <p className="line-items-editor__empty">{t('ui.lineItems.emptyHelp')}</p>
      ) : (
        <div>
          {lines.map((line, index) => {
            const rowTotal = lineTotal(line);
            const note = noteFor(index);
            return (
              <div
                key={index}
                className={['line-items-editor__line', note !== null ? 'line-items-editor__line--with-note' : ''].filter(Boolean).join(' ')}
              >
                <Select
                  id={`${idPrefix}-product-${index}`}
                  label={t('ui.lineItems.columnProduct')}
                  options={productOptions}
                  value={line.productId}
                  onChange={(event) => onPickProduct(index, event.target.value)}
                  onBlur={() => onBlur(index, 'productId')}
                  error={fieldError(index, 'productId')}
                  placeholder={t('ui.lineItems.selectProduct')}
                />
                <Input
                  id={`${idPrefix}-quantity-${index}`}
                  label={t('ui.lineItems.columnQuantity')}
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
                  <span className="form-label">{t('ui.lineItems.columnLineTotal')}</span>
                  {/* Derived, never typed: quantity x price, half-up to 2 decimals. */}
                  <span className="qty">{rowTotal === undefined ? '—' : formatMoneyLocalized(rowTotal, currency, 2)}</span>
                </div>
                {note !== null && <div className="line-items-editor__note-cell">{note}</div>}
                <div className="line-items-editor__line-remove">
                  <button
                    type="button"
                    className="button"
                    onClick={() => onRemove(index)}
                    disabled={disabled}
                    aria-label={t('ui.lineItems.removeLine', { number: index + 1 })}
                  >
                    {t('ui.lineItems.remove')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="line-items-editor__totals">
        <span>{t('ui.lineItems.orderTotal')}</span>
        {/* Right aligned, tabular numerals, thousands separators (totals read at a glance). */}
        <strong className="qty">{formatMoneyLocalized(total, currency, 2)}</strong>
      </div>
    </div>
  );
}
