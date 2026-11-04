import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const CONTROL =
  'min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none ' +
  'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50 ' +
  'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

/**
 * Label + control + hint/error. The label is associated with the control through `id`,
 * so tests can use getByLabelText('…').
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="mt-1 text-sm text-rose-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-sm text-zinc-500">{hint}</p>
      )}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${CONTROL} min-h-24 py-2 ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL} ${className}`} {...props} />;
}

/** Single choice from a few options, e.g. meal kind or schedule type. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="mb-3 flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition ${
            o.value === value ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100' : 'text-zinc-500'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 1…max rating (energy, sleep quality). */
export function Rating({
  label,
  value,
  max = 5,
  onChange,
}: {
  label: string;
  value: number | undefined;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="mb-3 flex gap-2">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${label}: ${n}`}
          onClick={() => onChange(n)}
          className={`size-11 rounded-full text-sm font-semibold transition ${
            n === value ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
