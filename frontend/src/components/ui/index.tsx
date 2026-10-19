/**
 * Reusable interface primitives built from the design system (T085).
 *
 * Each component reads tokens through CSS custom properties, never through a raw
 * value, so `check:design-values` (T082) can prove the design system is the only
 * source of colour, spacing and shadow.
 */

import type { ReactNode } from 'react';

export function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="card" aria-label={title}>
      {title !== undefined && <h2 className="card__title">{title}</h2>}
      {children}
    </section>
  );
}

export type StatusTone = 'success' | 'warning' | 'info' | 'neutral' | 'destructive';

/**
 * Status badge (MASTER.md "Status Badge Mapping"). The tone selects a token pair;
 * a caller passes a semantic tone, never a colour.
 */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className="badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <span className="skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="skeleton__bar" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}