import { describe, expect, it } from 'vitest';
import type { DateKey, PlannedSession, ProgramExercise } from '../../../core/types';
import { CARRY_VOLUME_FACTOR, groupsOf, planCarryOver, RECOVERY_DAYS, WEEKLY_VOLUME_CAP, type CarryLog } from './carry';
import { adjustForTargets } from './periodization';
import { PROGRAM_TEMPLATES } from './programs';

// November 2026: Mon 2, Wed 4, Fri 6, Mon 9, Wed 11, Fri 13, Mon 16.
const TODAY = '2026-11-03'; // Tuesday

let n = 0;
const session = (
  date: DateKey,
  exercises: ProgramExercise[],
  status: PlannedSession['status'] = 'planned',
  extra: Partial<PlannedSession> = {},
): PlannedSession => ({
  id: `s-${date}-${n++}`,
  createdAt: 0,
  updatedAt: 0,
  programId: 'p1',
  date,
  exercises,
  status,
  ...extra,
});

const back: ProgramExercise = { name: 'Тяга в наклоне', sets: 3, reps: 10 }; // back, arms
const legs: ProgramExercise = { name: 'Приседания', sets: 3, reps: 8 }; // legs, glutes, core
const press: ProgramExercise = { name: 'Жим лёжа', sets: 3, reps: 8 }; // chest, shoulders, arms
const normal = () => ({ deload: false, maxWorkoutIntensity: 'hard' as const });

describe('planCarryOver — adaptive plan (#226)', () => {
  it('Given пропущена сессия с группами «спина» и «ноги» When открываю следующую сессию той же программы Then в неё добавлены ключевые упражнения пропущенных групп с объёмом −30 % и пометкой «перенесено с <дата>», если с последней тренировки этих групп прошло ≥ 48 часов; иначе они уходят в следующую подходящую сессию', () => {
    const missed = session('2026-11-02', [back, legs], 'skipped');
    const next = session('2026-11-04', [press]);
    const after = session('2026-11-06', [press]);
    const plan = planCarryOver({ sessions: [missed, next, after], logs: [], targetsOn: normal, today: TODAY });
    expect(plan.additions).toEqual([
      { sessionId: next.id, exercise: { ...back, sets: 2, carriedFrom: '2026-11-02' } },
      {
        sessionId: next.id,
        exercise: { ...legs, sets: 2, carriedFrom: '2026-11-02' },
      },
    ]);
    expect(plan.handled).toEqual([{ sessionId: missed.id, names: ['Тяга в наклоне', 'Приседания'] }]);

    // Back was trained yesterday (a free workout): less than 48 h before Wednesday → the rows wait for Friday.
    const logs: CarryLog[] = [{ date: '2026-11-03', exercises: [{ name: 'Подтягивания', sets: [{}, {}] }] }];
    const later = planCarryOver({ sessions: [missed, next, after], logs, targetsOn: normal, today: TODAY });
    expect(later.additions.map((a) => [a.sessionId, a.exercise.name])).toEqual([
      [after.id, 'Тяга в наклоне'],
      [next.id, 'Приседания'],
    ]);
  });

  it('Given пропущены две сессии подряд When план пересчитывается Then недельный объём по каждой группе не превышает исходный плановый более чем на 20 %, лишнее переносится на следующую неделю, а не сваливается в одну сессию', () => {
    // Back three times a week, 4 sets each (12 a week, cap 14.4). Monday and Wednesday of this week are missed.
    const row = (name: string) =>
      ({ name, sets: 4, reps: 10, muscleGroups: ['back', 'arms'] as const }) as ProgramExercise;
    const mon = session('2026-11-02', [row('Тяга в наклоне')], 'skipped');
    const wed = session('2026-11-04', [row('Тяга штанги')], 'skipped');
    const fri = session('2026-11-06', [row('Подтягивания')]);
    const next = [
      session('2026-11-09', [row('Тяга в наклоне')]),
      session('2026-11-11', [row('Тяга штанги')]),
      session('2026-11-13', [row('Подтягивания')]),
    ];
    const plan = planCarryOver({
      sessions: [mon, wed, fri, ...next],
      logs: [],
      targetsOn: normal,
      today: '2026-11-05',
    });

    // Friday takes ONE carried back exercise (Monday's, 3 sets): 4 + 3 = 7 sets this week, within 14.4.
    expect(plan.additions[0]).toMatchObject({ sessionId: fri.id, exercise: { carriedFrom: '2026-11-02', sets: 3 } });
    // Wednesday's rows do not pile onto Friday: next week has 12 planned sets, so 2 more fit (14 ≤ 14.4).
    expect(plan.additions.slice(1)).toEqual([
      { sessionId: next[0]!.id, exercise: expect.objectContaining({ carriedFrom: '2026-11-04', sets: 2 }) },
    ]);
    const weekSets = (ids: string[], own: number) =>
      own + plan.additions.filter((x) => ids.includes(x.sessionId)).reduce((sum, x) => sum + x.exercise.sets, 0);
    expect(weekSets([fri.id], 4)).toBeLessThanOrEqual(12 * WEEKLY_VOLUME_CAP);
    expect(
      weekSets(
        next.map((x) => x.id),
        12,
      ),
    ).toBeLessThanOrEqual(12 * WEEKLY_VOLUME_CAP);
    expect(plan.handled.map((h) => h.sessionId)).toEqual([mon.id, wed.id]);
    expect(CARRY_VOLUME_FACTOR).toBe(0.7);
  });

  it('a missed deload day is not carried over, and is marked handled', () => {
    const missed = session('2026-11-02', [back], 'skipped');
    const next = session('2026-11-04', [press]);
    const plan = planCarryOver({
      sessions: [missed, next],
      logs: [],
      targetsOn: (date) => (date === '2026-11-02' ? { deload: true, maxWorkoutIntensity: 'light' } : normal()),
      today: TODAY,
    });
    expect(plan.additions).toEqual([]);
    expect(plan.handled).toEqual([{ sessionId: missed.id, names: ['Тяга в наклоне'] }]);
  });

  it('Given цели дня When идёт перенос Then учитываются deload и maxWorkoutIntensity: в разгрузочный день и день отдыха перенос не делается, объём ограничен правилами адаптации', () => {
    const missed = session('2026-11-02', [back], 'skipped');
    const deloadDay = session('2026-11-04', [press]);
    const restDay = session('2026-11-05', [press]);
    const normalDay = session('2026-11-06', [press]);
    const plan = planCarryOver({
      sessions: [missed, deloadDay, restDay, normalDay],
      logs: [],
      targetsOn: (date) =>
        date === '2026-11-04'
          ? { deload: true, maxWorkoutIntensity: 'moderate' }
          : date === '2026-11-05'
            ? { deload: false, maxWorkoutIntensity: 'rest' }
            : normal(),
      today: TODAY,
    });
    expect(plan.additions.map((a) => a.sessionId)).toEqual([normalDay.id]);
    // If that day later turns into a deload day, the session opens with the same −40 % for the carried copy too.
    const carried = plan.additions[0]!.exercise;
    expect(
      adjustForTargets([carried], { deload: true, maxWorkoutIntensity: 'moderate', reasons: [] }).exercises,
    ).toEqual([{ ...carried, sets: 1 }]);
  });

  it('no suitable session left this week (deload, rest, 48 h): the carry lands in next Monday', () => {
    const missed = session('2026-11-02', [back], 'skipped');
    const wed = session('2026-11-04', [{ ...back, name: 'Подтягивания' }]); // < 48 h after Tuesday's back workout
    const thu = session('2026-11-05', [press]); // < 48 h after Wednesday's pull-ups
    const fri = session('2026-11-06', [press]); // deload
    const nextMon = session('2026-11-09', [{ ...back, name: 'Шраги', sets: 6, muscleGroups: ['back', 'arms'] }]);
    const logs: CarryLog[] = [
      { date: '2026-11-03', exercises: [{ name: 'Тяга гантели', sets: [{}], muscleGroups: ['back'] }] },
    ];
    const plan = planCarryOver({
      sessions: [missed, wed, thu, fri, nextMon],
      logs,
      targetsOn: (date) => (date === '2026-11-06' ? { deload: true, maxWorkoutIntensity: 'moderate' } : normal()),
      today: '2026-11-04',
    });
    // Next week plans 6 back sets (cap 7.2) and holds 6: one set of the rows fits there.
    expect(plan.additions).toEqual([
      { sessionId: nextMon.id, exercise: { ...back, sets: 1, carriedFrom: '2026-11-02' } },
    ]);
  });

  it('a workout of the group logged today blocks a carry into today', () => {
    const missed = session('2026-11-02', [back], 'skipped');
    const today = session('2026-11-04', [press]);
    const fri = session('2026-11-06', [press]);
    const logs: CarryLog[] = [{ date: '2026-11-04', exercises: [{ name: 'Подтягивания', sets: [{}] }] }];
    const plan = planCarryOver({ sessions: [missed, today, fri], logs, targetsOn: normal, today: '2026-11-04' });
    expect(plan.additions.map((a) => a.sessionId)).toEqual([fri.id]);
  });

  it('a one-set exercise (a run) comes back whole: at least one set stays', () => {
    const run = { name: 'Лёгкий бег 30 минут', sets: 1, rpeTarget: 5 };
    const missed = session('2026-11-02', [run], 'skipped');
    const next = session('2026-11-04', [{ name: 'Интервалы по 2 минуты', sets: 6, rpeTarget: 8 }]);
    const plan = planCarryOver({ sessions: [missed, next], logs: [], targetsOn: normal, today: TODAY });
    expect(plan.additions).toEqual([{ sessionId: next.id, exercise: { ...run, carriedFrom: '2026-11-02' } }]);
  });

  it('no suitable session within the horizon: nothing is added and the missed exercise stays open', () => {
    const missed = session('2026-11-02', [back], 'skipped');
    const plan = planCarryOver({ sessions: [missed], logs: [], targetsOn: normal, today: TODAY });
    expect(plan).toEqual({ additions: [], handled: [] });
  });

  it('Given я вручную переношу или удаляю перенесённое упражнение When сохраняю Then автоматический перенос больше не возвращает его в эту сессию', () => {
    // The rows were carried before (carriedOut) and the user removed the copy: nothing comes back.
    const missed = session('2026-11-02', [back, legs], 'skipped', { carriedOut: ['тяга  в наклоне'] });
    const next = session('2026-11-04', [press]);
    const plan = planCarryOver({ sessions: [missed, next], logs: [], targetsOn: normal, today: TODAY });
    expect(plan.additions.map((a) => a.exercise.name)).toEqual(['Приседания']);
    expect(plan.handled).toEqual([{ sessionId: missed.id, names: ['Приседания'] }]);
  });

  it('ignores carried copies in a missed session, missed sessions older than two weeks, and other programs', () => {
    const chained = session('2026-11-02', [{ ...back, carriedFrom: '2026-10-30' }], 'skipped');
    const old = session('2026-10-19', [legs], 'skipped');
    const otherProgram = session('2026-11-04', [press], 'planned', { programId: 'p2' });
    const plan = planCarryOver({ sessions: [chained, old, otherProgram], logs: [], targetsOn: normal, today: TODAY });
    expect(plan.additions).toEqual([]);
  });

  it('a session takes one carried copy of an exercise: the same exercise from two misses spreads out', () => {
    const a = session('2026-10-30', [back], 'skipped');
    const b = session('2026-11-02', [back], 'skipped');
    const wed = session('2026-11-04', [press]);
    const fri = session('2026-11-06', [press]);
    const plan = planCarryOver({ sessions: [a, b, wed, fri], logs: [], targetsOn: normal, today: TODAY });
    expect(plan.additions.map((x) => [x.sessionId, x.exercise.carriedFrom])).toEqual([
      [wed.id, '2026-10-30'],
      [fri.id, '2026-11-02'],
    ]);
    // 48 h between the two carried rows: Wednesday → Friday.
    expect(RECOVERY_DAYS).toBe(2);
  });
});

describe('templates and the core exercise dictionary', () => {
  it('every exercise of the training templates has muscle groups (src/core/exercises.ts)', () => {
    const names = PROGRAM_TEMPLATES.flatMap((t) => t.days.flatMap((d) => d.exercises.map((e) => e.name)));
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => groupsOf({ name }).length === 0)).toEqual([]);
  });
});
