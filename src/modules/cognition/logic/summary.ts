import type { MindSession } from '../../../core/types';

export interface Comparison {
  average: number;
  /** value − average. */
  diff: number;
  /** undefined when equal. */
  better?: boolean;
}

/** The value of this session versus the personal average of the earlier ones; undefined without earlier ones. */
export function compareToAverage(value: number, earlier: number[], lowerIsBetter: boolean): Comparison | undefined {
  if (!earlier.length) return undefined;
  const average = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const diff = value - average;
  if (Math.abs(diff) < 0.5) return { average, diff: 0 };
  return { average, diff, better: lowerIsBetter ? diff < 0 : diff > 0 };
}

/** One sentence for the result card. `format` renders a magnitude with its unit. */
export function comparisonText(comparison: Comparison | undefined, format: (v: number) => string): string {
  if (!comparison) return 'Это первая сессия — сравнение с личным средним появится после следующей.';
  const avg = `личное среднее ${format(comparison.average)}`;
  if (comparison.better === undefined) return `Как ваше ${avg}.`;
  return `На ${format(Math.abs(comparison.diff))} ${comparison.better ? 'лучше' : 'хуже'}, чем ${avg}.`;
}

export type ExerciseKind = 'pvt' | 'nback' | 'stroop' | 'schulte';

export function formatSeconds(ms: number): string {
  return `${(ms / 1_000).toFixed(1).replace('.', ',')} с`;
}

/** «Последний результат» of a mind-trainer session for the exercise list. */
export function lastResultText(kind: Exclude<ExerciseKind, 'pvt'>, s: MindSession): string {
  switch (kind) {
    case 'nback':
      return `n = ${s.level ?? 2}, точность ${s.accuracyPct}%`;
    case 'stroop':
      return `точность ${s.accuracyPct}%${s.meanRtMs === undefined ? '' : `, ${s.meanRtMs} мс`}`;
    case 'schulte':
      return `${formatSeconds(s.durationMs)}, ошибок ${s.errors ?? 0}`;
  }
}

/** The latest session of a list by day, then by creation time. */
export function latestOf<T extends { date: string; createdAt: number }>(sessions: T[]): T | undefined {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).at(-1);
}
