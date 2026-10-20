import type { ReactNode } from 'react';
import type { BadgeStatus } from '../../dev/gallery/state-manifest';

export type StatusTone = 'success' | 'warning' | 'info' | 'neutral' | 'destructive';

/**
 * Mapping of API status names verbatim to design-system semantic tones.
 */
export const STATUS_TO_TONE: Record<BadgeStatus, StatusTone> = {
  DRAFT: 'neutral',
  CONFIRMED: 'info',
  ISSUED: 'info',
  PARTIALLY_RECEIVED: 'warning',
  PARTIALLY_SHIPPED: 'warning',
  PARTIALLY_PAID: 'warning',
  RECEIVED: 'success',
  SHIPPED: 'success',
  PAID: 'success',
  CANCELLED: 'destructive',
  VOID: 'destructive',
  ACTIVE: 'success',
  CONSUMED: 'neutral',
  RELEASED: 'info',
};

export interface BadgeProps {
  readonly status?: BadgeStatus;
  readonly tone?: StatusTone;
  readonly children?: ReactNode;
  readonly className?: string;
}

export function Badge({ status, tone, children, className }: BadgeProps) {
  const resolvedTone = tone ?? (status ? STATUS_TO_TONE[status] ?? 'neutral' : 'neutral');
  const content = children ?? status;

  return (
    <span
      className={['badge', className].filter(Boolean).join(' ')}
      data-tone={resolvedTone}
      role="status"
    >
      {content}
    </span>
  );
}
