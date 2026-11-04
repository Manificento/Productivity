import type { BalanceRow } from '../logic/balance';
import { formatDelta, formatHoursMinutes } from '../logic/balance';

const FALLBACK_COLOR = '#71717a';

/** Horizontal bars, one per category, drawn with plain SVG. */
export function BarList({ label, rows, showDelta }: { label: string; rows: BalanceRow[]; showDelta: boolean }) {
  const max = Math.max(...rows.map((r) => r.ms), 1);
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map((r) => {
        const width = (r.ms / max) * 100;
        const delta = formatDelta(r.deltaMs);
        return (
          <li key={r.categoryId}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{r.name}</span>
              <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                {formatHoursMinutes(r.ms)}
                {showDelta && (
                  <span
                    className={`ml-2 ${
                      r.deltaMs >= 60_000
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : r.deltaMs <= -60_000
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-zinc-500'
                    }`}
                  >
                    {delta}
                  </span>
                )}
              </span>
            </div>
            <svg
              viewBox="0 0 100 8"
              preserveAspectRatio="none"
              className="block h-2 w-full"
              aria-hidden="true"
              focusable="false"
            >
              <rect x="0" y="0" width="100" height="8" rx="4" className="fill-zinc-200 dark:fill-zinc-800" />
              {width > 0 && (
                <rect
                  data-testid="bar"
                  x="0"
                  y="0"
                  width={Math.max(width, 2)}
                  height="8"
                  rx="4"
                  fill={r.color ?? FALLBACK_COLOR}
                />
              )}
            </svg>
          </li>
        );
      })}
    </ul>
  );
}
