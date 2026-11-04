import type { InsightPoint } from '../logic/insights';

const W = 320;
const H = 180;
const PAD = { left: 30, right: 8, top: 8, bottom: 22 };

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

/** Scatter plot of paired days; axis ends are labelled with min and max. */
export function ScatterPlot({
  points,
  xLabel,
  yLabel,
  label,
}: {
  points: InsightPoint[];
  xLabel: string;
  yLabel: string;
  label: string;
}) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(0, ...ys), Math.max(...ys)];
  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.left - PAD.right);
  const sy = (y: number) => H - PAD.bottom - ((y - y0) / (y1 - y0 || 1)) * (H - PAD.top - PAD.bottom);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-44 w-full text-zinc-500">
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          className="stroke-zinc-300 dark:stroke-zinc-700"
        />
        <line
          x1={PAD.left}
          x2={PAD.left}
          y1={PAD.top}
          y2={H - PAD.bottom}
          className="stroke-zinc-300 dark:stroke-zinc-700"
        />
        <text x={PAD.left} y={H - 6} fontSize={10} fill="currentColor">
          {fmt(x0)}
        </text>
        <text x={W - PAD.right} y={H - 6} fontSize={10} fill="currentColor" textAnchor="end">
          {fmt(x1)}
        </text>
        <text x={PAD.left - 4} y={H - PAD.bottom} fontSize={10} fill="currentColor" textAnchor="end">
          {fmt(y0)}
        </text>
        <text x={PAD.left - 4} y={PAD.top + 8} fontSize={10} fill="currentColor" textAnchor="end">
          {fmt(y1)}
        </text>
        {points.map((p) => (
          <circle
            key={p.date}
            data-testid="scatter-point"
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={4.5}
            className="fill-indigo-500/70 dark:fill-indigo-400/70"
          >
            <title>{`${p.date}: ${fmt(p.x)} / ${fmt(p.y)}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>↑ {yLabel}</span>
        <span>{xLabel} →</span>
      </figcaption>
    </figure>
  );
}
