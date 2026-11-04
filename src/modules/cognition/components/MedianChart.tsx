import type { DayMedian } from '../logic/history';

const W = 320;
const H = 120;
const PAD = 12;

/** Line chart of the daily median reaction time; gaps on days without a test. */
export function MedianChart({ days }: { days: DayMedian[] }) {
  const values = days.flatMap((d) => (d.medianRtMs === undefined ? [] : [d.medianRtMs]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(1, days.length - 1);
  const y = (v: number) => (max === min ? H / 2 : PAD + ((max - v) * (H - 2 * PAD)) / span);
  const points = days.flatMap((d, i) => (d.medianRtMs === undefined ? [] : [{ i, v: d.medianRtMs }]));

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Медиана реакции за 14 дней: от ${min} до ${max} мс`}
        className="h-32 w-full text-indigo-600 dark:text-indigo-400"
      >
        <polyline
          points={points.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={3.5} fill="currentColor" />
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>14 дней назад</span>
        <span>Меньше — лучше</span>
        <span>Сегодня</span>
      </figcaption>
    </figure>
  );
}
