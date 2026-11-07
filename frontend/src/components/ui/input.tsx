import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly id: string;
  readonly label: string;
  readonly helpText?: string;
  readonly error?: string;
}

/**
 * Accepts a ref: form libraries such as react-hook-form register inputs by
 * attaching their ref through this component, so it must reach the native
 * input element (a plain function component drops it, which leaves the form
 * library unable to read, write or validate the field).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, helpText, error, required, className, ...props },
  ref,
) {
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-control">
      <label htmlFor={id} className="form-label">
        {label}
        {required && <span className="form-label__required" aria-hidden="true">*</span>}
      </label>
      <input
        id={id}
        className={['input', className].filter(Boolean).join(' ')}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
        ref={ref}
      />
      {helpText && (
        <span id={helpId} className="form-help-text">
          {helpText}
        </span>
      )}
      {error && (
        <span id={errorId} className="form-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
});
