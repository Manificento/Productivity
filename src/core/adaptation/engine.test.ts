import { describe, expect, it } from 'vitest';
import type { CheckIn, LifeEvent } from '../types';
import { computeDailyTargets, phaseFor, selectDrivingEvent } from './engine';
import { DEFAULT_BASELINE, shiftTime } from './rules';

const exam = (over: Partial<LifeEvent> = {}): LifeEvent => ({
  id: 'e1',
  createdAt: 0,
  updatedAt: 0,
  title: 'IELTS',
  type: 'exam',
  date: '2026-11-10',
  importance: 3,
  projectId: 'p-english',
  prepDays: 7,
  ...over,
});

const ctx = (over: Partial<Parameters<typeof computeDailyTargets>[1]> = {}) => ({
  baseline: DEFAULT_BASELINE,
  events: [],
  ...over,
});

describe('phaseFor', () => {
  it.each([
    ['2026-11-02', 'normal'], // 8 days before, outside 7-day prep
    ['2026-11-03', 'prep'], // 7 days before
    ['2026-11-08', 'prep'], // 2 days before
    ['2026-11-09', 'taper'],
    ['2026-11-10', 'event'],
    ['2026-11-11', 'recovery'],
    ['2026-11-12', 'normal'],
  ])('%s → %s', (date, phase) => {
    expect(phaseFor(date, exam())).toBe(phase);
  });
});

describe('selectDrivingEvent', () => {
  it('prefers higher importance over nearer date', () => {
    const minor = exam({ id: 'minor', importance: 1, date: '2026-11-06' });
    const major = exam({ id: 'major', importance: 3, date: '2026-11-10' });
    expect(selectDrivingEvent('2026-11-05', [minor, major])?.event.id).toBe('major');
  });

  it('prefers the nearer event at equal importance', () => {
    const far = exam({ id: 'far', date: '2026-11-12' });
    const near = exam({ id: 'near', date: '2026-11-08' });
    expect(selectDrivingEvent('2026-11-05', [far, near])?.event.id).toBe('near');
  });

  it('returns undefined when nothing applies', () => {
    expect(selectDrivingEvent('2026-10-01', [exam()])).toBeUndefined();
  });
});

describe('computeDailyTargets', () => {
  it('normal day equals the baseline with no reasons', () => {
    const t = computeDailyTargets('2026-10-01', ctx({ events: [exam()] }));
    expect(t.phase).toBe('normal');
    expect(t.taskCapacityMin).toBe(DEFAULT_BASELINE.taskCapacityMin);
    expect(t.reasons).toEqual([]);
  });

  it('prep: focus on the event project, more pomodoros, at least 8h sleep, workouts capped', () => {
    const t = computeDailyTargets('2026-11-06', ctx({ events: [exam()] }));
    expect(t.phase).toBe('prep');
    expect(t.focusProjectId).toBe('p-english');
    expect(t.focusPomodoros).toBe(DEFAULT_BASELINE.focusPomodoros + 3);
    expect(t.sleepHours).toBe(8);
    expect(t.maxWorkoutIntensity).toBe('moderate');
    expect(t.activeEventId).toBe('e1');
    expect(t.reasons.length).toBeGreaterThan(0);
  });

  it('taper: lighter day, earlier bedtime, no new foods', () => {
    const t = computeDailyTargets('2026-11-09', ctx({ events: [exam()] }));
    expect(t.phase).toBe('taper');
    expect(t.taskCapacityMin).toBe(210); // 360 * 0.6 = 216 → rounded to 15
    expect(t.bedtime).toBe(shiftTime(DEFAULT_BASELINE.bedtime, -30));
    expect(t.maxWorkoutIntensity).toBe('light');
    expect(t.noNewFoods).toBe(true);
    expect(t.caffeineCutoff).toBe('14:00');
  });

  it('event day: rest, minimal tasks', () => {
    const t = computeDailyTargets('2026-11-10', ctx({ events: [exam()] }));
    expect(t.phase).toBe('event');
    expect(t.maxWorkoutIntensity).toBe('rest');
    expect(t.focusPomodoros).toBe(0);
    expect(t.taskCapacityMin).toBe(105); // 360 * 0.3 = 108 → rounded to 15
  });

  it('recovery: lighter load, light workouts', () => {
    const t = computeDailyTargets('2026-11-11', ctx({ events: [exam()] }));
    expect(t.phase).toBe('recovery');
    expect(t.taskCapacityMin).toBe(255); // 252 → 255
    expect(t.maxWorkoutIntensity).toBe('light');
  });

  it('short sleep lowers capacity and caps workouts', () => {
    const t = computeDailyTargets('2026-10-01', ctx({ lastSleepHours: 5 }));
    expect(t.taskCapacityMin).toBe(285); // 288 → 285
    expect(t.maxWorkoutIntensity).toBe('light');
    expect(t.reasons.some((r) => r.includes('5.0'))).toBe(true);
  });

  it('low energy check-in lowers capacity', () => {
    const checkIn: CheckIn = { id: 'c', createdAt: 0, updatedAt: 0, date: '2026-10-01', energy: 2, focus: 3 };
    const t = computeDailyTargets('2026-10-01', ctx({ checkIn }));
    expect(t.taskCapacityMin).toBe(285);
  });

  it('rules stack: taper + short sleep', () => {
    const t = computeDailyTargets('2026-11-09', ctx({ events: [exam()], lastSleepHours: 5.5 }));
    expect(t.taskCapacityMin).toBe(165); // taper 210, then 210 * 0.8 = 168 → 165
  });

  it('is pure: same input gives same output', () => {
    const a = computeDailyTargets('2026-11-06', ctx({ events: [exam()] }));
    const b = computeDailyTargets('2026-11-06', ctx({ events: [exam()] }));
    expect(a).toEqual(b);
  });
});
