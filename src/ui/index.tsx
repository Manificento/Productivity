/**
 * Tiny shared UI kit so all modules look the same. Mobile-first (360 px), dark-mode aware.
 * Adding a component here is a contract change — prefer building inside your module first.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export { Field, Input, Rating, Segmented, Select, Textarea } from './forms';
export { Chip, IconButton, Progress, Sheet, Tabs } from './widgets';

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      {/* pr-12: room for the fixed ⚙️ «Настройки» link of the app shell, so `actions` stay tappable. */}
      <header className="mb-4 flex items-center justify-between gap-2 pr-12">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {title && <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">{title}</h2>}
      {children}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
  secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-xl px-4 text-sm font-medium transition disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-zinc-500">{children}</p>;
}

export function ComingSoon({ what }: { what: string }) {
  return (
    <Card>
      <p className="text-sm text-zinc-500">Модуль «{what}» ещё строится — см. задачи в GitHub Issues.</p>
    </Card>
  );
}
