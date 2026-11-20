import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Card } from '../../components/ui';

export interface ChartFrameProps {
  readonly title: string;
  /** One line stating exactly what the figures mean. */
  readonly definition: string;
  /** The data as an accessible table - the alternative to the chart. */
  readonly table: readonly { readonly label: string; readonly value: string }[];
  /** A short sentence describing the chart for a screen reader. */
  readonly summary: string;
  readonly isEmpty: boolean;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  /** A next step when there is nothing to chart, so an empty card still helps. */
  readonly emptyAction?: { readonly label: string; readonly to: string };
  /**
   * The same values the hover tooltip shows, as a panel a keyboard user can
   * focus. The accessible table already carries these; this is the in-chart
   * equivalent of hovering each point.
   */
  readonly focusValues?: readonly { readonly label: string; readonly value: string }[];
  /** Accessible name for the focusable values panel. */
  readonly focusValuesLabel?: string;
  /** An optional control (e.g. a segment switch) in the card header. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * The chart frame the Reports page and the Dashboard share.
 *
 * The chart is never the only copy of a value: the frame always offers the
 * same data as a table, and the table carries the numbers the chart draws.
 * Colours come from the design system's chart tokens, so the series are
 * distinguishable, and the summary describes the chart in words.
 */
/** The view choice is a preference, so it survives a refresh of the page. */
function storedTableView(title: string): boolean {
  try {
    return window.localStorage.getItem(`chart-table:${title}`) === 'true';
  } catch {
    return false;
  }
}

export function ChartFrame({
  title,
  definition,
  table,
  summary,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  focusValues,
  focusValuesLabel,
  actions,
  children,
  className,
}: ChartFrameProps) {
  const { t } = useTranslation();
  const [asTable, setAsTable] = useState(() => storedTableView(title));

  function toggleTable(): void {
    setAsTable((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(`chart-table:${title}`, String(next));
      } catch {
        // A browser with storage disabled still gets the view for this session.
      }
      return next;
    });
  }

  return (
    <Card
      className={['chart-frame', className].filter(Boolean).join(' ')}
      title={title}
      description={definition}
      actions={
        <>
          {actions !== undefined && actions}
          <button
            type="button"
            className="chart-frame__toggle"
            aria-pressed={asTable}
            onClick={toggleTable}
          >
            {asTable ? t('common.actions.showChart') : t('common.actions.showTable')}
          </button>
        </>
      }
    >
      <p className="chart-frame__summary">{summary}</p>
      {isEmpty ? (
        <div className="chart-frame__empty" role="status">
          <p className="chart-frame__empty-title">{emptyTitle}</p>
          <p className="chart-frame__empty-description">{emptyDescription}</p>
          {emptyAction && <Link className="chart-frame__empty-action" to={emptyAction.to}>{emptyAction.label}</Link>}
        </div>
      ) : asTable ? (
        <table className="chart-frame__table">
          <thead>
            <tr>
              <th scope="col">{t('common.labels.label')}</th>
              <th scope="col">{t('common.labels.value')}</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-frame__body">
          <div className="chart-frame__canvas" role="img" aria-label={summary}>
            {children}
          </div>
          {focusValues !== undefined && focusValues.length > 0 && (
            <div className="chart-frame__focus" tabIndex={0} role="group" aria-label={focusValuesLabel}>
              <span className="chart-frame__focus-hint">{focusValuesLabel}</span>
              <ul className="chart-frame__focus-list">
                {focusValues.map((row) => (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}