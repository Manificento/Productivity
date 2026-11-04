import type { Id, TimeCategory } from '../../../core/types';

export function CategoryButtons({
  categories,
  activeId,
  onStart,
}: {
  categories: TimeCategory[];
  activeId: Id | undefined;
  onStart: (category: TimeCategory) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {categories.map((c) => {
        const active = c.id === activeId;
        return (
          <li key={c.id}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onStart(c)}
              className={`flex min-h-14 w-full items-center gap-2 rounded-2xl border px-3 text-left text-sm font-medium transition ${
                active
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200'
                  : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800'
              }`}
            >
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: c.color ?? '#71717a' }}
              />
              <span className="truncate">{c.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
