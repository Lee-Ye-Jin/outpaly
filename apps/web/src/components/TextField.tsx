import { useId, type InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, ...input }: Props) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-11 rounded-lg border bg-ink px-3 text-[15px] text-text outline-none placeholder:text-text-3 focus:border-accent focus:ring-2 focus:ring-accent/30 ${
          error ? 'border-warn' : 'border-line-strong'
        }`}
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-warn">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
