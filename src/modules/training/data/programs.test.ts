import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { deleteWorkout } from './workouts';
import { saveWorkout } from '../../../core/logging/workout';
import {
  archiveProgram,
  completeSession,
  createProgram,
  extendEndedPrograms,
  extendProgram,
  loadMissedSessions,
  loadPlanEnds,
  rescheduleSession,
  loadActivePrograms,
  loadTodaySession,
  loadUpcomingSessions,
  replaceExercise,
  skipMissedSessions,
} from './programs';

const TODAY = '2026-11-04'; // Wednesday
const input = {
  name: 'Сила',
  weeks: 4,
  days: [
    { weekday: 1, exercises: [{ name: 'Присед', sets: 3, reps: 5 }] },
    { weekday: 3, exercises: [{ name: 'Жим', sets: 3 }] },
  ],
};

beforeEach(async () => {
  await db.programs.clear();
  await db.plannedSessions.clear();
  await db.workoutLogs.clear();
});

describe('programs data', () => {
  it('Given я создаю программу When добавляю дни и упражнения Then программа в programs, план на 4 недели — в plannedSessions', async () => {
    const p = await createProgram(input, TODAY, 1_000);
    expect(await db.programs.get(p.id)).toMatchObject({ name: 'Сила', weeks: 4, archived: false, days: input.days });
    const all = (await db.plannedSessions.toArray()).filter((s) => s.programId === p.id);
    expect(all).toHaveLength(8);
    expect(all.every((s) => s.status === 'planned')).toBe(true);
    expect(all.map((s) => s.date).sort()[0]).toBe(TODAY);
  });

  it('Given активная программа When я открываю «Сегодня» Then сегодняшняя сессия или «день отдыха»', async () => {
    await createProgram(input, TODAY, 1);
    const today = await loadTodaySession(TODAY);
    expect(today).toMatchObject({ rest: false, program: { name: 'Сила' } });
    expect(today && !today.rest && today.session.exercises[0].name).toBe('Жим');
    expect(await loadTodaySession('2026-11-05')).toEqual({ rest: true, ended: false });
    expect(await loadTodaySession('2026-12-02')).toEqual({ rest: true, ended: true }); // plan was 4 weeks
  });

  it('Given программа When я архивирую её Then будущие plannedSessions удалены, журнал не тронут', async () => {
    const p = await createProgram(input, TODAY, 1);
    const log = await saveWorkout({ date: TODAY, type: 'Силовая', durationMin: 40, rpe: 7 }, 2);
    await db.plannedSessions
      .where('[programId+date]')
      .equals([p.id, TODAY])
      .modify({ status: 'done', workoutLogId: log.id });
    await archiveProgram(p.id, TODAY, 3);
    expect((await db.programs.get(p.id))?.archived).toBe(true);
    const left = (await db.plannedSessions.toArray()).filter((s) => s.programId === p.id);
    expect(left.map((s) => s.date)).toEqual([TODAY]);
    expect(left[0].status).toBe('done');
    expect(await db.workoutLogs.count()).toBe(1);
    expect(await loadActivePrograms()).toEqual([]);
  });
});

describe('no active program', () => {
  it('has no today session and no rest day', async () => {
    expect(await loadTodaySession(TODAY)).toBeUndefined();
  });
});

describe('session execution', () => {
  const workout = {
    date: TODAY,
    type: 'Силовая',
    durationMin: 50,
    rpe: 7,
    exercises: [{ name: 'Жим', sets: [{ reps: 8 }, { reps: 8 }] }],
  };

  it('Given сегодняшняя сессия When я завершаю её Then запись в workoutLogs через saveWorkout() с упражнениями и RPE; сессия помечена выполненной', async () => {
    const p = await createProgram(input, TODAY, 1);
    const session = (await db.plannedSessions.toArray()).find((s) => s.programId === p.id && s.date === TODAY)!;
    const log = await completeSession(session.id, workout, 5);
    expect(await db.workoutLogs.get(log.id)).toMatchObject({ rpe: 7, exercises: workout.exercises });
    expect(await db.plannedSessions.get(session.id)).toMatchObject({ status: 'done', workoutLogId: log.id });
  });

  it('an already done session is not logged twice', async () => {
    const p = await createProgram(input, TODAY, 1);
    const session = (await db.plannedSessions.toArray()).find((s) => s.programId === p.id && s.date === TODAY)!;
    await completeSession(session.id, workout, 5);
    await expect(completeSession(session.id, workout, 6)).rejects.toThrow();
    expect(await db.workoutLogs.count()).toBe(1);
  });

  it('a failed update rolls the workout back', async () => {
    const p = await createProgram(input, TODAY, 1);
    const session = (await db.plannedSessions.toArray()).find((s) => s.programId === p.id && s.date === TODAY)!;
    const spy = vi.spyOn(db.plannedSessions, 'update').mockRejectedValueOnce(new Error('boom'));
    await expect(completeSession(session.id, workout, 5)).rejects.toThrow();
    spy.mockRestore();
    expect(await db.workoutLogs.count()).toBe(0);
  });

  it('Given сессия не выполнена When наступает следующий день Then она помечена «пропущена», план не сдвигается', async () => {
    const p = await createProgram(input, TODAY, 1);
    const before = (await db.plannedSessions.toArray()).map((s) => s.date).sort();
    await skipMissedSessions('2026-11-05', 9);
    const after = await db.plannedSessions.toArray();
    expect(after.map((s) => s.date).sort()).toEqual(before);
    expect(after.find((s) => s.programId === p.id && s.date === TODAY)?.status).toBe('skipped');
    expect(after.filter((s) => s.status === 'skipped')).toHaveLength(1);
  });

  it('a skipped session cannot be completed', async () => {
    const p = await createProgram(input, TODAY, 1);
    const session = (await db.plannedSessions.toArray()).find((s) => s.programId === p.id && s.date === TODAY)!;
    await skipMissedSessions('2026-11-05', 2);
    await expect(completeSession(session.id, workout, 3)).rejects.toThrow();
  });

  it('deleting the journal entry reopens its session (planned today, skipped for a past day)', async () => {
    const p = await createProgram(input, TODAY, 1);
    const session = (await db.plannedSessions.toArray()).find((s) => s.programId === p.id && s.date === TODAY)!;
    const log = await completeSession(session.id, workout, 5);
    await deleteWorkout(log.id, TODAY);
    expect(await db.workoutLogs.count()).toBe(0);
    const reopened = await db.plannedSessions.get(session.id);
    expect(reopened?.status).toBe('planned');
    expect(reopened?.workoutLogId).toBeUndefined();

    const log2 = await completeSession(session.id, workout, 6);
    await deleteWorkout(log2.id, '2026-11-05');
    expect((await db.plannedSessions.get(session.id))?.status).toBe('skipped');
  });

  it('done sessions are not marked skipped', async () => {
    const p = await createProgram(input, TODAY, 1);
    const session = (await db.plannedSessions.toArray()).find((s) => s.programId === p.id && s.date === TODAY)!;
    await completeSession(session.id, workout, 5);
    await skipMissedSessions('2026-11-05', 9);
    expect((await db.plannedSessions.get(session.id))?.status).toBe('done');
  });

  it('Given сессия When я заменяю упражнение Then изменение только в этой сессии', async () => {
    const p = await createProgram(input, TODAY, 1);
    const all = (await db.plannedSessions.toArray()).filter((s) => s.programId === p.id);
    const target = all.find((s) => s.date === TODAY)!;
    await replaceExercise(target.id, 0, 'Отжимания', 7);
    const after = (await db.plannedSessions.toArray()).filter((s) => s.programId === p.id);
    expect(after.find((s) => s.id === target.id)?.exercises[0]).toMatchObject({ name: 'Отжимания', sets: 3 });
    const sameWeekday = after.find((s) => s.id !== target.id && s.exercises[0].name === 'Жим');
    expect(sameWeekday).toBeDefined();
    expect((await db.programs.get(p.id))?.days[1].exercises[0].name).toBe('Жим');
  });
});

describe('loadUpcomingSessions', () => {
  it('returns planned sessions of active programs within the inclusive range', async () => {
    const a = await createProgram(input, TODAY, 1);
    const b = await createProgram({ ...input, name: 'Другая' }, TODAY, 2);
    await archiveProgram(b.id, '2026-12-31', 3); // archived: its sessions are gone from the list
    const first = (await db.plannedSessions.toArray()).find((s) => s.programId === a.id && s.date === TODAY)!;
    await completeSession(first.id, { date: TODAY, type: 'Силовая', durationMin: 30, rpe: 5 }, 4);
    const list = await loadUpcomingSessions(TODAY, '2026-11-09');
    expect(list.map((s) => s.date)).toEqual(['2026-11-09']); // 11-04 is done; 11-09 is the inclusive edge
    expect(list.every((s) => s.programId === a.id)).toBe(true);
  });
});

describe('missed sessions, reschedule and extension', () => {
  it('Given сессия вчера не выполнена Then она в списке пропущенных; выполненные и чужие архивные — нет', async () => {
    const p = await createProgram(input, '2026-11-02', 1); // Mon 11-02, Wed 11-04, …
    await skipMissedSessions('2026-11-03', 2);
    const missed = await loadMissedSessions('2026-11-03');
    expect(missed.map((s) => s.date)).toEqual(['2026-11-02']);
    await archiveProgram(p.id, '2026-11-03', 3);
    expect(await loadMissedSessions('2026-11-03')).toEqual([]);
  });

  it('Given я переношу сессию When выбираю другой день Then дата меняется, статус снова planned', async () => {
    const p = await createProgram(input, '2026-11-02', 1);
    await skipMissedSessions('2026-11-03', 2);
    const [missed] = await loadMissedSessions('2026-11-03');
    await rescheduleSession(missed!.id, '2026-11-05', '2026-11-03', 5);
    const moved = await db.plannedSessions.get(missed!.id);
    expect(moved).toMatchObject({ date: '2026-11-05', status: 'planned', programId: p.id, updatedAt: 5 });
    expect(await loadMissedSessions('2026-11-03')).toEqual([]);
  });

  it('Given в день уже есть сессия той же программы When переношу Then отказ и данные не меняются', async () => {
    await createProgram(input, '2026-11-02', 1);
    await skipMissedSessions('2026-11-03', 2);
    const [missed] = await loadMissedSessions('2026-11-03');
    await expect(rescheduleSession(missed!.id, '2026-11-04', '2026-11-03')).rejects.toThrow(/уже есть/);
    expect((await db.plannedSessions.get(missed!.id))?.date).toBe('2026-11-02');
  });

  it('Given до конца плана меньше 7 дней When продлеваю Then 4 недели по тому же расписанию без дублей', async () => {
    const p = await createProgram(input, TODAY, 1); // ends 2026-11-30
    expect(await loadPlanEnds()).toEqual(new Map([[p.id, '2026-11-30']]));
    expect(await extendProgram(p.id, '2026-11-27', 9)).toBe(8);
    expect(await extendProgram(p.id, '2026-11-27', 10)).toBe(0); // a double tap adds nothing
    const dates = (await db.plannedSessions.toArray()).map((s) => s.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toHaveLength(16);
    expect(dates).toContain('2026-12-02');
  });

  it('Given план закончился When продлеваю все закончившиеся Then новый план стартует с сегодня', async () => {
    const p = await createProgram(input, TODAY, 1);
    const other = await createProgram({ ...input, name: 'Бег' }, '2026-12-01', 1);
    expect(await extendEndedPrograms('2026-12-05', 3)).toBe(1);
    const mine = (await db.plannedSessions.where('programId').equals(p.id).toArray()).map((s) => s.date).sort();
    expect(mine.at(-1)).toBe('2026-12-30');
    expect(await db.plannedSessions.where('programId').equals(other.id).count()).toBe(8); // still running
  });
});
