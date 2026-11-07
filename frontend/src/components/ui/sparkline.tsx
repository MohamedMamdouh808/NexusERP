export interface SparklineProps {
  readonly values: readonly number[];
  readonly label: string;
  readonly className?: string;
}

/** A compact line chart for a KPI, rendered as inline SVG (no dependencies). */
export function Sparkline({ values, label, className }: SparklineProps) {
  if (values.length < 2) return null;
  const width = 120;
  const height = 36;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - (value / max) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      className={['sparkline', className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={points[points.length - 1].split(',')[0]} cy={points[points.length - 1].split(',')[1]} r="2.5" fill="var(--color-primary)" />
    </svg>
  );
}
