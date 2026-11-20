import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input, Select } from '../../components/ui';

export type DateRangePreset =
  | 'today'
  | 'this-week'
  | 'this-month'
  | 'last-month'
  | 'last-30-days'
  | 'this-quarter'
  | 'this-year'
  | 'custom';

export interface DateRange {
  readonly start: string;
  readonly end: string;
  readonly preset: DateRangePreset;
}

const PRESET_VALUES: readonly DateRangePreset[] = [
  'this-month',
  'last-month',
  'last-30-days',
  'this-quarter',
  'this-year',
  'today',
  'this-week',
  'custom',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function computePresetRange(preset: DateRangePreset, today: Date): DateRange {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();

  const firstOfMonth = new Date(Date.UTC(y, m, 1));
  const firstOfLastMonth = new Date(Date.UTC(y, m - 1, 1));
  const lastOfLastMonth = new Date(Date.UTC(y, m, 0));
  const dayOfWeek = (t.getUTCDay() + 6) % 7; // Monday-based week
  const weekStart = new Date(t);
  weekStart.setUTCDate(weekStart.getUTCDate() - dayOfWeek);

  const quarterStartMonth = Math.floor(m / 3) * 3;
  const quarterStart = new Date(Date.UTC(y, quarterStartMonth, 1));
  const yearStart = new Date(Date.UTC(y, 0, 1));
  const thirtyDaysAgo = new Date(t);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);

  const ranges: Record<Exclude<DateRangePreset, 'custom'>, { start: Date; end: Date }> = {
    today: { start: t, end: t },
    'this-week': { start: weekStart, end: t },
    'this-month': { start: firstOfMonth, end: t },
    'last-month': { start: firstOfLastMonth, end: lastOfLastMonth },
    'last-30-days': { start: thirtyDaysAgo, end: t },
    'this-quarter': { start: quarterStart, end: t },
    'this-year': { start: yearStart, end: t },
  };

  if (preset === 'custom') {
    return { start: toIsoDate(t), end: toIsoDate(t), preset };
  }
  const { start, end } = ranges[preset];
  return { start: toIsoDate(start), end: toIsoDate(end), preset };
}

export interface DateRangeSelectorProps {
  readonly value: DateRange;
  readonly onChange: (range: DateRange) => void;
}

/**
 * The date range control for reports. Presets compute a range in UTC;
 * custom mode reveals from/to inputs validated to keep the end on or after
 * the start. Nothing is rendered for the ranges the reports use until the
 * selection is valid — the control stays disabled until then.
 */
export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const [customOpen, setCustomOpen] = useState(value.preset === 'custom');
  const [from, setFrom] = useState(value.start);
  const [to, setTo] = useState(value.end);
  const [error, setError] = useState('');

  const presetKeyMap: Record<DateRangePreset, string> = {
    today: 'today',
    'this-week': 'thisWeek',
    'this-month': 'thisMonth',
    'last-month': 'lastMonth',
    'last-30-days': 'last30Days',
    'this-quarter': 'thisQuarter',
    'this-year': 'thisYear',
    custom: 'custom',
  };

  const options = PRESET_VALUES.map((preset) => ({
    value: preset,
    label: t(`reports.page.range.${presetKeyMap[preset]}`),
  }));

  const formatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' }),
    [i18n.language],
  );

  function selectPreset(preset: string) {
    if (preset === 'custom') {
      setCustomOpen(true);
      onChange({ ...value, preset: 'custom' });
      return;
    }
    setCustomOpen(false);
    setError('');
    onChange(computePresetRange(preset as DateRangePreset, today));
  }

  function applyCustom() {
    if (!from || !to) {
      setError(t('reports.page.rangeError'));
      return;
    }
    if (to < from) {
      setError(t('reports.page.rangeError'));
      return;
    }
    setError('');
    onChange({ start: from, end: to, preset: 'custom' });
  }

  return (
    <div className="reports-range">
      <Select
        id="reports-range-preset"
        label={t('reports.page.range.label')}
        value={value.preset}
        options={options}
        onChange={(e) => selectPreset(e.target.value)}
      />
      {customOpen && (
        <div className="reports-range__custom">
          <Input
            id="reports-range-from"
            label={t('reports.page.range.from')}
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            id="reports-range-to"
            label={t('reports.page.range.to')}
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
          <Button variant="secondary" onClick={applyCustom}>
            {t('reports.page.range.apply')}
          </Button>
        </div>
      )}
      <p className="reports-range__summary" aria-live="polite">
        {t('reports.page.rangeSummary', {
          from: formatter.format(new Date(value.start)),
          to: formatter.format(new Date(value.end)),
        })}
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}