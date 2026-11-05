import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { saveWorkout } from '../../../core/logging/workout';
import { archiveProgram, createProgram, loadActivePrograms, loadTodaySession } from './programs';

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
