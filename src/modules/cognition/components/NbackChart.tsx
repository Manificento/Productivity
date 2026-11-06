import type { DayProgress } from '../logic/nback';

const W = 320;
const H = 120;
const PAD = 12;

/** Daily n-back history: bars = level, line = accuracy (0–100%); gaps on days without a session. */
export function NbackChart({ days }: { days: DayProgress[] }) {
  const maxLevel = Math.max(1, ...days.map((d) => d.level ?? 0));
  const step = (W - 2 * PAD) / days.length;
  const x = (i: number) => PAD + step * (i + 0.5);
  const yAcc = (v: number) => PAD + ((100 - v) * (H - 2 * PAD)) / 100;
  const points = days.flatMap((d, i) => (d.accuracyPct === undefined ? [] : [{ i, v: d.accuracyPct }]));
  const last = [...days].reverse().find((d) => d.level !== undefined);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Уровень и точность n-back по дням${last ? `: последний уровень ${last.level}, точность ${last.accuracyPct}%` : ''}`}
        className="h-32 w-full"
      >
        {days.map((d, i) =>
          d.level === undefined ? null : (
            <rect
              key={d.date}
              x={x(i) - step * 0.3}
              width={step * 0.6}
              y={H - PAD - (d.level / maxLevel) * (H - 2 * PAD)}
              height={(d.level / maxLevel) * (H - 2 * PAD)}
              className="fill-indigo-200 dark:fill-indigo-900"
            />
          ),
        )}
        <polyline
          points={points.map((p) => `${x(p.i)},${yAcc(p.v)}`).join(' ')}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          className="stroke-emerald-600 dark:stroke-emerald-400"
        />
        {points.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={yAcc(p.v)} r={3.5} className="fill-emerald-600 dark:fill-emerald-400" />
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-zinc-500">
        <span>14 дней назад</span>
        <span>
          <span className="text-indigo-500">▮</span> уровень n · <span className="text-emerald-600">●</span> точность
        </span>
        <span>Сегодня</span>
      </figcaption>
    </figure>
  );
}
