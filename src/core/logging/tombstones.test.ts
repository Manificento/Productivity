import { beforeEach, describe, expect, it } from 'vitest';
import { storedRows } from '../../test/storedRows';
import { db, softDelete } from '../db';
import type { SleepLog } from '../types';
import { deleteSleep, saveSleep } from './sleep';
import { sleepWindow } from './sleepTime';
import { importTasks } from './tasks';
import { saveWorkout } from './workout';

const SC = 'com.northcube.sleepcycle';
const night = (day: string, bed = '23:30', wake = '07:00') => sleepWindow(day, bed, wake);

beforeEach(async () => {
  await Promise.all([db.sleepLogs.clear(), db.workoutLogs.clear(), db.tasks.clear(), db.projects.clear()]);
  await db.syncOutbox.clear();
});

/**
 * ADR-0009, sync p. 2: a deleted row is a tombstone that still holds its unique key (`&date`). The shared write
 * paths (ADR-0007) must create the record again on that key without an error and without losing anything.
 */
describe('contract #274: общие пути записи и удалённые записи', () => {
  it('deleteSleep оставляет tombstone, а saveSleep на тот же день создаёт ночь заново без ошибки (&date)', async () => {
    const first = await saveSleep({ ...night('2026-11-05'), quality: 3 }, 1_000);
    await deleteSleep(first.id);

    expect(await db.sleepLogs.count()).toBe(0);
    // The tombstone keeps the key and the times only: the night's data is gone from the device.
    const [tombstone] = await storedRows<SleepLog>('sleepLogs');
    expect(tombstone).toEqual({
      id: first.id,
      createdAt: 1_000,
      updatedAt: expect.any(Number),
      deletedAt: expect.any(Number),
    });

    const again = await saveSleep({ ...night('2026-11-05', '22:00', '06:30'), quality: 5 }, 2_000);
    expect(await db.sleepLogs.toArray()).toEqual([again]);
    expect(again).toMatchObject({ date: '2026-11-05', quality: 5, createdAt: 2_000 });
    // One night on the day in the store too (the tombstone has no `date`), and the old night's deletion is still
    // queued for the sync.
    expect((await storedRows<SleepLog>('sleepLogs')).filter((s) => s.date === '2026-11-05')).toEqual([again]);
    expect(await db.syncOutbox.get(['sleepLogs', first.id])).toBeDefined();
    expect(await db.syncOutbox.get(['sleepLogs', again.id])).toBeDefined();

    // The usual rule still holds afterwards: a second save for the day updates the same record.
    const edited = await saveSleep({ ...night('2026-11-05'), quality: 4 }, 3_000);
    expect(edited.id).toBe(again.id);
    expect(await db.sleepLogs.count()).toBe(1);
  });

  it('перенос ночи на другой день (deleteSleep, затем saveSleep) и обратно работает через tombstone', async () => {
    const old = await saveSleep({ ...night('2026-11-05'), quality: 3 }, 1_000);
    await deleteSleep(old.id);
    const moved = await saveSleep({ ...night('2026-11-06'), quality: 3 }, 2_000);
    await deleteSleep(moved.id);
    const back = await saveSleep({ ...night('2026-11-05'), quality: 3 }, 3_000);

    expect(await db.sleepLogs.toArray()).toEqual([back]);
  });

  it('импортированная ночь удалена → повторный импорт создаёт её заново: без ошибки и без дубля', async () => {
    const imported = await saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 1_000);
    await deleteSleep(imported.id);

    const again = await saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 2_000);
    expect(again.id).not.toBe(imported.id);
    expect(await db.sleepLogs.toArray()).toEqual([again]);
    expect(await db.sleepLogs.where('[sourceId+externalId]').equals([SC, 'sc-1']).count()).toBe(1);

    // A manual night on a day whose imported night was deleted is not blocked either.
    await deleteSleep(again.id);
    const manual = await saveSleep({ ...night('2026-11-05'), quality: 5 }, 3_000);
    expect(await db.sleepLogs.toArray()).toEqual([manual]);
  });

  it('импортированная ночь переехала на занятый день: её копия становится tombstone, а освободившийся день можно записать снова', async () => {
    const other = await saveSleep({ ...night('2026-11-06'), quality: 4 }, 1_000);
    const first = await saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 1_000);
    expect(await saveSleep({ ...night('2026-11-06'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 2_000)).toEqual(
      other,
    );

    expect(await db.sleepLogs.toArray()).toEqual([other]);
    const copy = (await storedRows<SleepLog>('sleepLogs')).find((s) => s.id === first.id);
    expect(copy?.deletedAt).toEqual(expect.any(Number));

    const fresh = await saveSleep({ ...night('2026-11-05'), quality: 2 }, 3_000);
    expect((await db.sleepLogs.orderBy('date').toArray()).map((s) => s.id)).toEqual([fresh.id, other.id]);
  });

  it('saveWorkout: импортированная тренировка удалена → повторный импорт создаёт одну запись без ошибки', async () => {
    const workout = { date: '2026-11-04', type: 'Бег', durationMin: 30, rpe: 6 };
    const imported = await saveWorkout({ ...workout, sourceId: 'com.strava', externalId: 'hc-1' }, 1_000);
    await softDelete(db.workoutLogs, imported.id);
    expect(await db.workoutLogs.count()).toBe(0);

    const again = await saveWorkout({ ...workout, sourceId: 'com.strava', externalId: 'hc-1' }, 2_000);
    expect(again.id).not.toBe(imported.id);
    expect(await db.workoutLogs.toArray()).toEqual([again]);
    // Re-importing once more updates that record instead of adding a third row.
    await saveWorkout({ ...workout, durationMin: 45, sourceId: 'com.strava', externalId: 'hc-1' }, 3_000);
    expect(await db.workoutLogs.toArray()).toEqual([{ ...again, durationMin: 45, updatedAt: 3_000 }]);
  });

  it('importTasks: импортированные задача и проект удалены → повторный импорт создаёт их заново, по одной записи', async () => {
    const input = {
      projects: [{ name: 'Дом' }],
      tasks: [{ title: 'Купить лампу', projectName: 'Дом', externalId: '1' }],
    };
    await importTasks(input, { source: 'todoist' }, 1_000);
    const [task] = await db.tasks.toArray();
    const [project] = await db.projects.toArray();
    await softDelete(db.tasks, task!.id);
    await softDelete(db.projects, project!.id);

    const result = await importTasks(input, { source: 'todoist' }, 2_000);
    expect(result).toEqual({ projects: { created: 1, reused: 0 }, tasks: { created: 1, updated: 0 } });
    const tasks = await db.tasks.toArray();
    const projects = await db.projects.toArray();
    expect(tasks).toHaveLength(1);
    expect(projects).toHaveLength(1);
    // The new task points at the new project, not at the deleted one.
    expect(tasks[0]!.projectId).toBe(projects[0]!.id);
    expect(projects[0]!.id).not.toBe(project!.id);
  });
});
