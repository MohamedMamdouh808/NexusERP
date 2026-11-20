import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { formatMoneyLocalized } from '../../lib/i18n-format';
import type { IconName } from '../../components/ui/icon';
import { Icon } from '../../components/ui/icon';

export interface DashboardKpi {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit: 'money' | 'count';
  readonly previousValue?: string;
  /** The server's own change against the previous period; null when there is none. */
  readonly change?: string | null;
  /** Set on the figures that are not bound to the range. */
  readonly asOf?: string;
}

export interface DashboardKpiCardProps {
  readonly kpi: DashboardKpi;
  readonly currency: string;
  /** True when a fall is a good thing (a shrinking overdue balance is good). */
  readonly lowerIsBetter?: boolean;
  readonly to: string;
  readonly periodLabel: string;
  /** The entry-point icon; the icon's colour comes from the CSS by key. */
  readonly icon: IconName;
  /** The one-line definition the page supplies; absent when the server gives one. */
  readonly definition?: string;
  /** A muted secondary figure - only the outstanding card uses it, for overdue. */
  readonly secondary?: { readonly label: string; readonly value: string };
}

/**
 * The dashboard KPI row: a card per figure.
 *
 * The figure is the server's own, shown large with the currency code next to
 * it; the change is the server's own and is shown in words with an arrow, so
 * colour is never the only signal, and the direction that counts as good is
 * stated per figure (a shrinking overdue balance is good news). When there is
 * no comparable previous period the change is a muted null-looking note, and
 * never a fabricated percentage.
 */
export function DashboardKpiCard({
  kpi,
  currency,
  lowerIsBetter = false,
  to,
  periodLabel,
  icon,
  definition,
  secondary,
}: DashboardKpiCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const formatted =
    kpi.unit === 'money' ? formatMoneyLocalized(kpi.value, currency, 2) : kpi.value;
  // The formatter emits the ISO code as its own token; show it muted beside the figure.
  const code = formatted.match(/[A-Z]{3}/u)?.[0] ?? '';
  const text = code === '' ? formatted : formatted.replace(code, '').trim();

  const change = kpi.change;
  const hasChange = change !== null && change !== undefined;
  const negative = hasChange && Number(change) < 0;
  const isGood = hasChange ? (lowerIsBetter ? negative : !negative) : false;

  async function copyValue(): Promise<void> {
    if (navigator.clipboard === undefined) return;
    try {
      await navigator.clipboard.writeText(`${kpi.label}: ${formatted}${code === '' ? '' : ` ${code}`} (${periodLabel})`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the figure stays on screen either way.
    }
  }

  const copyLabel = t(copied ? 'dashboard.kpi.copied' : 'dashboard.kpi.copyValue');

  return (
    <div className="dashboard-kpi-frame">
    <Link className="dashboard-kpi" to={to}>
      <span className="dashboard-kpi__icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="dashboard-kpi__body">
        <span className="dashboard-kpi__label">{kpi.label}</span>
        <span className="dashboard-kpi__figure">
          <strong className="dashboard-kpi__value">{text}</strong>
          {code !== '' && <span className="dashboard-kpi__currency">{code}</span>}
        </span>
        {hasChange ? (
          <span className={`dashboard-kpi__change ${isGood ? 'is-good' : 'is-bad'}`}>
            <span aria-hidden="true">{negative ? '↓' : '↑'}</span>
            <span>{t(negative ? 'dashboard.kpi.decreased' : 'dashboard.kpi.increased', { amount: kpi.unit === 'money' ? formatMoneyLocalized(change, currency, 2) : change })}</span>
            <span className="sr-only">{isGood ? t('dashboard.kpi.goodDirection') : t('dashboard.kpi.badDirection')}</span>
          </span>
        ) : (
          <span className="dashboard-kpi__change">{t('dashboard.kpi.noPreviousPeriod')}</span>
        )}
        {definition !== undefined && <span className="dashboard-kpi__definition">{definition}</span>}
        {secondary !== undefined && Number(secondary.value) > 0 && (
          <span className="dashboard-kpi__overdue">
            {secondary.label}: {formatMoneyLocalized(secondary.value, currency, 2)}
          </span>
        )}
      </span>
      <span className="dashboard-kpi__period">
        {kpi.asOf ? t('dashboard.kpi.asOfToday') : periodLabel}
      </span>
    </Link>
    <button type="button" className="dashboard-kpi__copy" onClick={() => void copyValue()} aria-label={copyLabel} title={copyLabel}>
      <Icon name={copied ? 'check' : 'copy'} />
    </button>
    </div>
  );
}
