import { useId, type ReactNode } from 'react';

/** A titled card that is exposed as a named region («Входящие», «Выполнено сегодня»). */
export function TaskSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="mb-3 rounded-2xl border border-zinc-200 bg-white px-2 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id={id} className="mb-1 px-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}
