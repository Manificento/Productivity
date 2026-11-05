import { describe, expect, it } from 'vitest';
import type { WorkoutLog } from '../../../core/types';
import {
  draftFromWorkout,
  emptyDraft,
  formatSets,
  parseDraft,
  weekStart,
  weekStats,
  type WorkoutDraft,
} from './workouts';

const TODAY = '2026-11-04'; // Wednesday

function workout(date: string, durationMin: number, rpe: number, extra: Partial<WorkoutLog> = {}): WorkoutLog {
  return { id: date + durationMin, createdAt: 0, updatedAt: 0, date, type: 'Бег', durationMin, rpe, ...extra };
}

const draft = (patch: Partial<WorkoutDraft>): WorkoutDraft => ({
  ...emptyDraft(TODAY),
  durationMin: '45',
  rpe: '6',
  ...patch,
});

describe('parseDraft', () => {
  it('Given the form When I pick a type, duration and RPE 1–10 and save Then a valid workout is produced', () => {
    expect(parseDraft(draft({ type: 'Бег', durationMin: '45', rpe: '7' }), TODAY)).toEqual({
      ok: true,
      value: { date: TODAY, type: 'Бег', durationMin: 45, rpe: 7 },
    });
  });

  it('rejects RPE outside 1–10, a missing duration and an empty type', () => {
    expect(parseDraft(draft({ rpe: '11' }), TODAY)).toMatchObject({ ok: false, error: 'RPE — от 1 до 10' });
    expect(parseDraft(draft({ durationMin: '' }), TODAY)).toMatchObject({
      ok: false,
      error: 'Укажите длительность в минутах',
    });
    expect(parseDraft(draft({ type: ' ' }), TODAY)).toMatchObject({ ok: false, error: 'Выберите тип тренировки' });
  });

  it('Given I add exercises with sets When I save Then they are part of the workout; empty rows are dropped', () => {
    const r = parseDraft(
      draft({
        type: 'Силовая',
        exercises: [
          {
            name: 'Жим лёжа',
            sets: [
              { reps: '10', weightKg: '60' },
              { reps: '8', weightKg: '' },
              { reps: '', weightKg: '' },
            ],
          },
          { name: '', sets: [{ reps: '', weightKg: '' }] },
        ],
      }),
      TODAY,
    );
    expect(r.ok && r.value.exercises).toEqual([{ name: 'Жим лёжа', sets: [{ reps: 10, weightKg: 60 }, { reps: 8 }] }]);
  });

  it('an exercise with sets but no name is an error', () => {
    const r = parseDraft(draft({ exercises: [{ name: '', sets: [{ reps: '10', weightKg: '' }] }] }), TODAY);
    expect(r).toEqual({ ok: false, error: 'Укажите название упражнения' });
  });

  it('accepts a decimal comma in the weight and rejects negative numbers', () => {
    const ok = parseDraft(draft({ exercises: [{ name: 'Присед', sets: [{ reps: '5', weightKg: '82,5' }] }] }), TODAY);
    expect(ok.ok && ok.value.exercises?.[0].sets[0].weightKg).toBe(82.5);
    const bad = parseDraft(draft({ exercises: [{ name: 'Присед', sets: [{ reps: '-5', weightKg: '' }] }] }), TODAY);
    expect(bad).toEqual({ ok: false, error: 'Повторы и вес — неотрицательные числа' });
  });

  it('a future date is rejected', () => {
    expect(parseDraft(draft({ date: '2026-11-05' }), TODAY)).toEqual({
      ok: false,
      error: 'Дата тренировки не может быть в будущем',
    });
  });
});

describe('draftFromWorkout', () => {
  it('Given a past workout When I press «Повторить» Then the form gets its data with today’s date', () => {
    const past = workout('2026-10-30', 60, 8, {
      type: 'Силовая',
      exercises: [{ name: 'Тяга', sets: [{ reps: 5, weightKg: 100 }, { reps: 5 }] }],
      note: 'тяжело',
    });
    expect(draftFromWorkout(past, TODAY)).toEqual({
      date: TODAY,
      type: 'Силовая',
      durationMin: '60',
      rpe: '8',
      exercises: [
        {
          name: 'Тяга',
          sets: [
            { reps: '5', weightKg: '100' },
            { reps: '5', weightKg: '' },
          ],
        },
      ],
      note: 'тяжело',
    });
  });
});

describe('weekStats', () => {
  it('Given workouts this week When the screen opens Then minutes, count and average RPE for the week (Mon–Sun) are shown', () => {
    const logs = [
      workout('2026-11-02', 30, 5), // Monday
      workout('2026-11-04', 60, 8),
      workout('2026-11-01', 90, 9), // last Sunday — previous week
    ];
    expect(weekStats(logs, TODAY)).toEqual({ minutes: 90, count: 2, avgRpe: 6.5 });
  });

  it('the week is Monday–Sunday: on Sunday it starts the previous Monday, on Monday it starts that day', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    const logs = [workout('2026-11-02', 30, 5), workout('2026-11-08', 40, 7), workout('2026-11-09', 50, 9)];
    expect(weekStats(logs, '2026-11-08')).toEqual({ minutes: 70, count: 2, avgRpe: 6 });
    expect(weekStats(logs, '2026-11-09')).toEqual({ minutes: 50, count: 1, avgRpe: 9 });
  });

  it('no workouts this week: zeros and no average', () => {
    expect(weekStats([workout('2026-10-20', 30, 5)], TODAY)).toEqual({ minutes: 0, count: 0 });
  });
});

describe('formatting', () => {
  it('formatSets lists reps × weight', () => {
    expect(formatSets([{ reps: 10, weightKg: 60 }, { reps: 8 }, { weightKg: 20 }])).toBe('10 × 60 кг, 8 повт., 20 кг');
  });
});

describe('formatSets without reps and weight', () => {
  it('shows the number of sets, or «подход» among filled sets', () => {
    expect(formatSets([{}, {}, {}])).toBe('3 подх.');
    expect(formatSets([{ reps: 5 }, {}])).toBe('5 повт., подход');
  });
});
