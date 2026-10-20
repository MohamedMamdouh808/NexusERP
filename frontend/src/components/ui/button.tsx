import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'default';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly loading?: boolean;
  readonly children: ReactNode;
  readonly reason?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'default',
    loading = false,
    disabled = false,
    children,
    reason,
    className,
    ...props
  },
  ref,
) {
  const isActuallyDisabled = disabled || loading;
  let state = 'default';
  if (isActuallyDisabled) {
    state = loading ? 'loading' : 'disabled';
  }

  const variantClass = variant !== 'default' ? `button--${variant}` : '';
  const classes = ['button', variantClass, className].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      disabled={isActuallyDisabled}
      aria-busy={loading ? 'true' : undefined}
      data-state={state}
      {...props}
    >
      {loading && (
        <span
          className="skeleton__bar"
          style={{ width: '1rem', height: '1rem', borderRadius: '50%', display: 'inline-block' }}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
      {reason && <span className="button__reason">({reason})</span>}
    </button>
  );
});
