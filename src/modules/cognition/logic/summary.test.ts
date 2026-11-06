import { describe, expect, it } from 'vitest';
import { compareToAverage, comparisonText, formatSeconds, lastResultText } from './summary';

describe('summary and personal average', () => {
  it('Given earlier sessions Then the result is compared with their average, in the right direction', () => {
    expect(compareToAverage(40, [50, 60], true)).toEqual({ average: 55, diff: -15, better: true });
    expect(compareToAverage(90, [80, 84], false)).toMatchObject({ better: true });
    expect(compareToAverage(70, [80, 84], false)).toMatchObject({ better: false });
    expect(compareToAverage(55, [55], true)).toEqual({ average: 55, diff: 0 });
    expect(compareToAverage(55, [], true)).toBeUndefined();
  });

  it('texts: first session, better, worse, same', () => {
    const f = (v: number) => `${Math.round(v)} мс`;
    expect(comparisonText(undefined, f)).toMatch(/первая сессия/);
    expect(comparisonText(compareToAverage(500, [600], true), f)).toBe('На 100 мс лучше, чем личное среднее 600 мс.');
    expect(comparisonText(compareToAverage(700, [600], true), f)).toBe('На 100 мс хуже, чем личное среднее 600 мс.');
    expect(comparisonText(compareToAverage(600, [600], true), f)).toBe('Как ваше личное среднее 600 мс.');
  });

  it('last result lines for the exercise list', () => {
    const base = { id: 'x', createdAt: 1, updatedAt: 1, date: '2026-11-04', durationMs: 41_240 };
    expect(lastResultText('schulte', { ...base, kind: 'schulte', accuracyPct: 96, errors: 1 })).toBe(
      '41,2 с, ошибок 1',
    );
    expect(lastResultText('stroop', { ...base, kind: 'stroop', accuracyPct: 92, meanRtMs: 640 })).toBe(
      'точность 92%, 640 мс',
    );
    expect(lastResultText('nback', { ...base, kind: 'nback', accuracyPct: 90, level: 3 })).toBe('n = 3, точность 90%');
    expect(formatSeconds(5_000)).toBe('5,0 с');
  });
});
