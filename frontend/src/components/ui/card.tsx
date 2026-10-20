import type { ReactNode } from 'react';

export interface CardProps {
  readonly title?: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Card({ title, description, actions, children, className }: CardProps) {
  const cardId = title ? `card-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : undefined;
  const descId = description && cardId ? `${cardId}-desc` : undefined;

  return (
    <section
      className={['card', className].filter(Boolean).join(' ')}
      aria-labelledby={cardId}
      aria-describedby={descId}
    >
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--spacing-md)' }}>
          <div>
            {title && (
              <h2 id={cardId} className="card__title">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} style={{ margin: 'calc(var(--spacing-xs) * -1) 0 var(--spacing-md)', color: 'var(--color-muted-foreground)', fontSize: '0.875rem' }}>
                {description}
              </p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
