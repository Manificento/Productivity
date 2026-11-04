import { describe, expect, it } from 'vitest';
import { computeDailyTargets } from '../../../core/adaptation/engine';
import { DEFAULT_BASELINE } from '../../../core/adaptation/rules';
import type { LifeEvent } from '../../../core/types';
import { intensityWarning, maxRpe } from './adaptation';

describe('maxRpe', () => {
  it('maps intensity to an RPE ceiling: rest → 0, light ≤ 4, moderate ≤ 6, hard ≤ 10', () => {
    expect(maxRpe('rest')).toBe(0);
    expect(maxRpe('light')).toBe(4);
    expect(maxRpe('moderate')).toBe(6);
    expect(maxRpe('hard')).toBe(10);
  });
});

describe('intensityWarning', () => {
  // Real engine output, so a change of the core wording or caps shows up here.
  const shortSleep = computeDailyTargets('2026-11-04', { baseline: DEFAULT_BASELINE, events: [], lastSleepHours: 5 });

  it('Given maxWorkoutIntensity = light When I choose RPE 7 Then a soft warning carries the reason from `reasons`', () => {
    expect(shortSleep.maxWorkoutIntensity).toBe('light');
    expect(intensityWarning(7, shortSleep)).toEqual({ limit: 4, label: 'лёгкая', reasons: shortSleep.reasons });
    expect(shortSleep.reasons.join(' ')).toMatch(/тренировка не выше лёгкой/);
  });

  it('no warning at or below the ceiling, or before an RPE is chosen', () => {
    expect(intensityWarning(4, shortSleep)).toBeUndefined();
    expect(intensityWarning(undefined, shortSleep)).toBeUndefined();
    expect(intensityWarning(10, { maxWorkoutIntensity: 'hard', reasons: [] })).toBeUndefined();
  });

  it('rest (event day): any workout gets a warning with the day’s reasons', () => {
    const exam: LifeEvent = {
      id: 'e',
      createdAt: 0,
      updatedAt: 0,
      title: 'Экзамен',
      type: 'exam',
      date: '2026-11-04',
      importance: 3,
      prepDays: 7,
    };
    const eventDay = computeDailyTargets('2026-11-04', { baseline: DEFAULT_BASELINE, events: [exam] });
    expect(intensityWarning(1, eventDay)).toEqual({ limit: 0, label: 'отдых', reasons: eventDay.reasons });
  });

  it('a lowered baseline without adjustments says so', () => {
    expect(intensityWarning(7, { maxWorkoutIntensity: 'moderate', reasons: [] })?.reasons).toEqual([
      'Так задано в вашем обычном режиме',
    ]);
  });
});
