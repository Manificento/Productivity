import type { TrendPoint } from '../logic/trend';

const W = 320;
const H = 140;
const PAD = 8;

/** Points of daily weight with the smoothed trend line over them (when `showTrend`). */
export function WeightChart({ series, showTrend }: { series: TrendPoint[]; showTrend: boolean }) {
  const values = series.flatMap((p) => [p.kg, p.trend]);
  const lo = Math.min(...values) - 0.5;
  const hi = Math.max(...values) + 0.5;
  const x = (i: number) => (series.length < 2 ? W / 2 : PAD + (i / (series.length - 1)) * (W - 2 * PAD));
  const y = (kg: number) => H - PAD - ((kg - lo) / (hi - lo)) * (H - 2 * PAD);
  const line = series.map((p, i) => `${x(i).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Вес: записей ${series.length}${showTrend ? ', линия тренда' : ''}`}
      className="h-36 w-full"
    >
      {series.map((p, i) => (
        <circle
          key={p.date}
          data-testid="weight-point"
          cx={x(i)}
          cy={y(p.kg)}
          r={3}
          className="fill-zinc-400 dark:fill-zinc-500"
        >
          <title>{`${p.date}: ${p.kg} кг`}</title>
        </circle>
      ))}
      {showTrend && (
        <polyline
          data-testid="weight-trend"
          points={line}
          fill="none"
          strokeWidth={2.5}
          strokeLinejoin="round"
          className="stroke-indigo-500 dark:stroke-indigo-400"
        />
      )}
    </svg>
  );
}
