import { Children } from 'react';
import type { ReactNode } from 'react';

/**
 * The page header every page opens with (T027, FR-017).
 *
 * Three rules are structural rather than remembered:
 *
 *  - One primary action, and it is the page's. A page that has none passes
 *    nothing, and the right-hand side renders empty instead of holding a control
 *    that does nothing.
 *  - Secondary actions sit to the left of the primary one, so the reading order
 *    matches the visual order.
 *  - The title is the page's `h1`. Every destination in the shell therefore has
 *    exactly one first-level heading, which is what the router tests assert.
 *
 * The class names are the ones the design system publishes (`.page-header`,
 * `.page-header__title`, `.page-header__description`, `.page-header__actions`).
 */

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly secondaryActions?: readonly ReactNode[];
  readonly primaryAction?: ReactNode;
}

export function PageHeader({
  title,
  description,
  secondaryActions,
  primaryAction,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        {description === undefined ? null : (
          <p className="page-header__description">{description}</p>
        )}
      </div>

      <div className="page-header__actions">
        {/* Children.toArray assigns keys, so a list of actions needs none. */}
        {Children.toArray(secondaryActions)}
        {primaryAction}
      </div>
    </div>
  );
}
