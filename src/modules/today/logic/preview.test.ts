import { describe, expect, it } from 'vitest';
import { DEFAULT_BASELINE } from '../../../core/adaptation/rules';
import type { LifeEvent } from '../../../core/types';
import { formatCapacity, previewDays } from './preview';

const ielts: LifeEvent = {
  id: 'ielts',
  title: 'IELTS',
  type: 'exam',
  date: '2026-11-09',
  importance: 3,
  prepDays: 7,
  createdAt: 0,
  updatedAt: 0,
};

describe('previewDays', () => {
  it('Given событие через 5 дней When я открываю его Then вижу таблицу на 10 дней: фаза, ёмкость, сон, тренировка, фокус-сессии', () => {
    const rows = previewDays(ielts, [], DEFAULT_BASELINE, '2026-11-04');
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.date)).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ]);
    expect(rows.map((r) => r.phase)).toEqual([
      'prep',
      'prep',
      'prep',
      'prep',
      'taper',
      'event',
      'recovery',
      'normal',
      'normal',
      'normal',
    ]);
    expect(rows[0]).toEqual({
      date: '2026-11-04',
      phase: 'prep',
      taskCapacityMin: 360,
      sleepHours: 8,
      maxWorkoutIntensity: 'moderate',
      focusPomodoros: 7,
      habitsMode: 'all',
      meditationKind: 'focus',
      mindTrainingMin: 10,
      deload: false,
    });
    expect(rows[5]).toMatchObject({
      phase: 'event',
      taskCapacityMin: 105,
      maxWorkoutIntensity: 'rest',
      focusPomodoros: 0,
    });
  });

  it('Given предпросмотр 10 дней Then он показывает новые поля целей v2', () => {
    const rows = previewDays(ielts, [], DEFAULT_BASELINE, '2026-11-04');
    expect(rows[4]).toMatchObject({ phase: 'taper', deload: true, mindTrainingMin: 5, habitsMode: 'all' });
    expect(rows[5]).toMatchObject({
      phase: 'event',
      deload: true,
      habitsMode: 'essential',
      meditationKind: 'breathing',
    });
    expect(rows[6]).toMatchObject({ phase: 'recovery', deload: false, meditationKind: 'body' });
  });

  it('Given я меняю важность или дни подготовки Then предпросмотр пересчитывается', () => {
    const before = previewDays(ielts, [], DEFAULT_BASELINE, '2026-11-04');
    const after = previewDays({ ...ielts, importance: 1, prepDays: 2 }, [], DEFAULT_BASELINE, '2026-11-04');
    expect(before[0].focusPomodoros).toBe(7);
    expect(after[0]).toMatchObject({ phase: 'normal', focusPomodoros: 4 });
    expect(after[3]).toMatchObject({ phase: 'prep', focusPomodoros: 5 });
  });

  it('shows the plan that will really happen when a more important event overlaps', () => {
    const deadline: LifeEvent = { ...ielts, id: 'd', title: 'Дедлайн', date: '2026-11-07', importance: 1, prepDays: 2 };
    const rows = previewDays(deadline, [ielts], DEFAULT_BASELINE, '2026-11-04');
    // On the deadline day IELTS preparation still drives the day.
    expect(rows[3]).toMatchObject({ date: '2026-11-07', phase: 'prep', focusPomodoros: 7 });
  });

  it('replaces the stored version of the event being edited', () => {
    const rows = previewDays({ ...ielts, importance: 1 }, [ielts], DEFAULT_BASELINE, '2026-11-04');
    expect(rows[0].focusPomodoros).toBe(5);
  });

  it('uses the user’s baseline', () => {
    const rows = previewDays(ielts, [], { ...DEFAULT_BASELINE, taskCapacityMin: 300 }, '2026-11-04');
    expect(rows[9].taskCapacityMin).toBe(300);
  });
});

describe('formatCapacity', () => {
  it.each([
    [360, '6 ч'],
    [210, '3,5 ч'],
    [105, '1,8 ч'],
    [350, '5,8 ч'],
    [45, '45 мин'],
    [0, '0'],
  ])('%i → %s', (min, label) => {
    expect(formatCapacity(min)).toBe(label);
  });
});
