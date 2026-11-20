import { Link } from 'react-router-dom';

import type { ReactNode } from 'react';

import { Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';

export interface AttentionSectionItem {
  readonly key: string;
  readonly icon: IconName;
  readonly title: string;
  readonly count: number;
  /** The overdue balance, when the item is the receivables; shown in warning style when above zero. */
  readonly balance?: string;
  readonly to: string;
  readonly viewAllLabel: string;
  readonly emptyLabel: string;
  /** The item shows only when the member's permissions make it visible. */
  readonly enabled: boolean;
  readonly rows: readonly {
    readonly key: string;
    readonly label: string;
    readonly to: string;
    readonly detail?: string;
    /** Extra context shown on hover/focus, without taking space in the row. */
    readonly preview?: string;
  }[];
}

/**
 * The needs-attention card: one card holding a row per attention item, the
 * overdue balance where relevant, "View all" on the right, rows separated by
 * dividers, and the item's top-5 list beneath it as compact linked rows. An
 * item with nothing to show says so in muted text on its row. The card renders
 * only when at least one item the member may see has something behind it.
 */
export function AttentionSection({
  ariaLabel,
  title,
  items,
}: {
  readonly ariaLabel: string;
  readonly title: string;
  readonly items: readonly AttentionSectionItem[];
}): ReactNode {
  const visible = items.filter((item) => item.enabled);
  if (visible.length === 0) return null;
  const count = visible.reduce((total, item) => total + item.count, 0);

  return (
    <section className="overview-page__attention" aria-label={ariaLabel}>
      <h3 className="overview-page__attention-title">
        {title} <span className="overview-page__attention-count">{count}</span>
      </h3>
      <ol className="overview-page__attention-rows">
        {visible.map((item) => (
            <li key={item.key} className="overview-page__attention-row">
              <span className="overview-page__attention-icon" aria-hidden="true">
                <Icon name={item.icon} />
              </span>
              <span className="overview-page__attention-text">
                <span className="overview-page__attention-label">{item.title}</span>
                {item.count > 0 ? (
                  <span className="overview-page__attention-count">{item.count}</span>
                ) : (
                  <span className="overview-page__attention-count muted">{item.emptyLabel}</span>
                )}
                {item.balance !== undefined && Number(item.balance) > 0 && (
                  <span className="overview-page__attention-balance">{item.balance}</span>
                )}
              </span>
              <Link className="overview-page__attention-view-all" to={item.to}>
                {item.viewAllLabel}
              </Link>
            </li>
          ))}
        </ol>
        <div className="overview-page__attention-lists">
          {visible
            .filter((item) => item.count > 0)
            .map((item) => (
              <div key={item.key} className="overview-page__attention-list">
                <ul className="overview-page__attention-list-rows">
                  {item.rows.slice(0, 5).map((row) => (
                    <li key={row.key} className="overview-page__attention-list-row">
                      <Link
                        to={row.to}
                        data-preview={row.preview}
                        aria-label={row.preview === undefined ? undefined : `${row.label} — ${row.preview}`}
                      >
                        <span className="overview-page__attention-list-label">{row.label}</span>
                        {row.detail !== undefined && (
                          <span className="overview-page__attention-list-detail">{row.detail}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </section>
    );
}
