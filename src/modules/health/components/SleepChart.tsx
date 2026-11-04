import type { SleepBar } from '../logic/sleep';
import { formatHours } from '../logic/sleep';

const W = 320;
const H = 140;
const PAD_TOP = 8;
const PAD_BOTTOM = 4;
const GAP = 4;

/** 14 bars of sleep duration; a dashed line marks the 7-day average. */
export function SleepChart({ bars, average }: { bars: SleepBar[]; average?: number }) {
  const max = Math.max(10, ...bars.map((b) => b.hours ?? 0));
  const barW = (W - GAP * (bars.length - 1)) / bars.length;
  const y = (h: number) => H - PAD_BOTTOM - (h / max) * (H - PAD_TOP - PAD_BOTTOM);
  const logged = bars.filter((b) => b.hours !== undefined).length;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Длительность сна за 14 дней: записей ${logged}${average === undefined ? '' : `, среднее за 7 дней ${formatHours(average)}`}`}
        className="h-36 w-full"
      >
        {bars.map((b, i) =>
          b.hours === undefined ? (
            <rect
              key={b.date}
              x={i * (barW + GAP)}
              y={H - PAD_BOTTOM - 2}
              width={barW}
              height={2}
              className="fill-zinc-200 dark:fill-zinc-800"
            />
          ) : (
            <rect
              key={b.date}
              data-testid="sleep-bar"
              x={i * (barW + GAP)}
              y={y(b.hours)}
              width={barW}
              height={H - PAD_BOTTOM - y(b.hours)}
              rx={3}
              className="fill-indigo-500 dark:fill-indigo-400"
            >
              <title>{`${b.date}: ${formatHours(b.hours)}`}</title>
            </rect>
          ),
        )}
        {average !== undefined && (
          <line
            x1={0}
            x2={W}
            y1={y(average)}
            y2={y(average)}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            className="stroke-amber-500"
          />
        )}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>14 дней назад</span>
        <span>Сегодня</span>
      </figcaption>
    </figure>
  );
}
