import { describe, expect, it } from 'vitest';
import { formatHoursDiff, intensityWarning, maxRpe } from './adaptation';

describe('formatHoursDiff', () => {
  it('Given a sleep goal of 8 h and 6.5 h slept Then the difference reads «−1,5 ч»', () => {
    expect(formatHoursDiff(6.5 - 8)).toBe('−1,5 ч');
  });

  it('more sleep than the goal gets a plus sign; a match is «0 ч»', () => {
    expect(formatHoursDiff(0.5)).toBe('+0,5 ч');
    expect(formatHoursDiff(0.02)).toBe('0 ч');
  });
});

describe('maxRpe', () => {
  it('maps intensity to an RPE ceiling: rest → 0, light ≤ 4, moderate ≤ 6, hard ≤ 10', () => {
    expect(maxRpe('rest')).toBe(0);
    expect(maxRpe('light')).toBe(4);
    expect(maxRpe('moderate')).toBe(6);
    expect(maxRpe('hard')).toBe(10);
  });
});

describe('intensityWarning', () => {
  const reasons = [
    'Подготовка к «Экзамен»: +3 фокус-сессии',
    'Сон прошлой ночью 5.0 ч: нагрузка −20%, тренировка не выше лёгкой',
  ];

  it('Given maxWorkoutIntensity = light When I choose RPE 7 Then a soft warning carries the reason from `reasons`', () => {
    expect(intensityWarning(7, { maxWorkoutIntensity: 'light', reasons })).toEqual({
      limit: 4,
      label: 'лёгкая',
      reasons: ['Сон прошлой ночью 5.0 ч: нагрузка −20%, тренировка не выше лёгкой'],
    });
  });

  it('no warning at or below the ceiling, or before an RPE is chosen', () => {
    expect(intensityWarning(4, { maxWorkoutIntensity: 'light', reasons })).toBeUndefined();
    expect(intensityWarning(undefined, { maxWorkoutIntensity: 'light', reasons })).toBeUndefined();
    expect(intensityWarning(10, { maxWorkoutIntensity: 'hard', reasons })).toBeUndefined();
  });

  it('rest: any workout gets a warning', () => {
    expect(
      intensityWarning(1, { maxWorkoutIntensity: 'rest', reasons: ['Сегодня «Экзамен»: без тренировки'] }),
    ).toEqual({
      limit: 0,
      label: 'отдых',
      reasons: ['Сегодня «Экзамен»: без тренировки'],
    });
  });

  it('when no reason mentions workouts, all reasons of the day are shown', () => {
    const taper = ['Завтра «Экзамен»: разгрузочный день', 'Отбой на 30 минут раньше'];
    expect(intensityWarning(6, { maxWorkoutIntensity: 'light', reasons: taper })?.reasons).toEqual(taper);
  });

  it('a lowered baseline without adjustments says so', () => {
    expect(intensityWarning(7, { maxWorkoutIntensity: 'moderate', reasons: [] })?.reasons).toEqual([
      'Так задано в вашем обычном режиме',
    ]);
  });
});
