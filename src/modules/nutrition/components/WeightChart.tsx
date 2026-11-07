import { daysBetween } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { formatKg, trendSegments, type TrendPoint } from '../logic/trend';

const W = 320;
const H = 140;
const PAD = 8;

/**
 * Points of daily weight with the smoothed trend line over them (when `showTrend`).
 * The X axis is calendar days from the first point to `today`; the trend line breaks over gaps.
 */
export function WeightChart({
  series,
  today,
  showTrend,
}: {
  series: TrendPoint[];
  today: DateKey;
  showTrend: boolean;
}) {
  const first = series[0]!.date;
  const last = series.at(-1)!.date;
  const span = Math.max(daysBetween(first, last > today ? last : today), 1);
  const values = series.flatMap((p) => [p.kg, p.trend]);
  const lo = Math.min(...values) - 0.5;
  const hi = Math.max(...values) + 0.5;
  const x = (date: DateKey) =>
    first === last && last >= today ? W / 2 : PAD + (daysBetween(first, date) / span) * (W - 2 * PAD);
  const y = (kg: number) => H - PAD - ((kg - lo) / (hi - lo)) * (H - 2 * PAD);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Вес: записей ${series.length}${showTrend ? ', линия тренда' : ''}`}
      className="h-36 w-full"
    >
      {series.map((p) => (
        <circle
          key={p.date}
          data-testid="weight-point"
          cx={x(p.date)}
          cy={y(p.kg)}
          r={3}
          className="fill-zinc-400 dark:fill-zinc-500"
        >
          <title>{`${p.date}: ${formatKg(p.kg)} кг`}</title>
        </circle>
      ))}
      {showTrend &&
        trendSegments(series).map((segment) => (
          <polyline
            key={segment[0]!.date}
            data-testid="weight-trend"
            points={segment.map((p) => `${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' ')}
            fill="none"
            strokeWidth={2.5}
            strokeLinejoin="round"
            className="stroke-indigo-500 dark:stroke-indigo-400"
          />
        ))}
    </svg>
  );
}
