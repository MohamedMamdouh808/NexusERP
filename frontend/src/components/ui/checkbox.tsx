import type { InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly id: string;
  readonly label: string;
  readonly helpText?: string;
  readonly error?: string;
}

export function Checkbox({ id, label, helpText, error, required, disabled, className, ...props }: CheckboxProps) {
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  const containerClasses = [
    'checkbox-container',
    disabled ? 'checkbox-container--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="form-control">
      <label htmlFor={id} className={containerClasses}>
        <input
          id={id}
          type="checkbox"
          className={['checkbox', className].filter(Boolean).join(' ')}
          required={required}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        <span>
          {label}
          {required && <span className="form-label__required" aria-hidden="true">*</span>}
        </span>
      </label>
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
}
