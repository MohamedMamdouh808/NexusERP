import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly id: string;
  readonly label: string;
  readonly helpText?: string;
  readonly error?: string;
}

export function Textarea({ id, label, helpText, error, required, className, ...props }: TextareaProps) {
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-control">
      <label htmlFor={id} className="form-label">
        {label}
        {required && <span className="form-label__required" aria-hidden="true">*</span>}
      </label>
      <textarea
        id={id}
        className={['textarea', className].filter(Boolean).join(' ')}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
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
}
