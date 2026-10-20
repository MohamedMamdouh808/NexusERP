export interface SkeletonProps {
  readonly label: string;
  readonly reducedMotion?: boolean;
  readonly className?: string;
}

export function Skeleton({ label, reducedMotion = false, className }: SkeletonProps) {
  const barClass = reducedMotion
    ? 'skeleton__bar skeleton__bar--no-animation'
    : 'skeleton__bar';

  return (
    <span
      className={['skeleton', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={barClass} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
