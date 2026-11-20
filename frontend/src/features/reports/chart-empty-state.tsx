export interface ChartEmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly className?: string;
}

/**
 * The shared empty state used by every chart container on the reports page.
 * A dashed frame with a quiet line-chart glyph, a clear title and the reason
 * there is nothing to plot yet. The frame carries the `noscript` role and
 * text labels, so the empty chart is announced rather than silently blank.
 */
export function ChartEmptyState({ title, description, className }: ChartEmptyStateProps) {
  return (
    <div
      className={['reports-chart-empty', className].filter(Boolean).join(' ')}
      role="status"
      aria-label={`${title}. ${description}`}
    >
      <svg
        className="reports-chart-empty__glyph"
        viewBox="0 0 64 40"
        role="img"
        aria-label={title}
        focusable="false"
      >
        <path
          d="M2 38h60M6 34L18 24l10 8 16-18 12 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="reports-chart-empty__title">{title}</p>
      <p className="reports-chart-empty__description">{description}</p>
    </div>
  );
}