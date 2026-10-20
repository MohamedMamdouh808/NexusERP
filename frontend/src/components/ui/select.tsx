import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly error?: string;
}

export function Select({
  id,
  label,
  options,
  placeholder,
  helpText,
  error,
  required,
  className,
  ...props
}: SelectProps) {
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-control">
      <label htmlFor={id} className="form-label">
        {label}
        {required && <span className="form-label__required" aria-hidden="true">*</span>}
      </label>
      <select
        id={id}
        className={['select', className].filter(Boolean).join(' ')}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
      >
        {placeholder && (
          <option value="" disabled selected={props.defaultValue === undefined && props.value === undefined}>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
