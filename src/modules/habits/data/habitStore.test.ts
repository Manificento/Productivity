import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { naturalId, newRecord } from '../../../core/ids';
import { doneDays } from '../../../core/habitSchedule';
import { archiveHabit, createHabit, toggleHabit, updateHabit } from './habitStore';

beforeEach(async () => {
  await Promise.all([db.habits.clear(), db.habitLogs.clear()]);
});

describe('habitStore', () => {
  it('один HabitLog на привычку и день: тап создаёт, повторный тап снимает и снова ставит', async () => {
    expect(await toggleHabit('h1', '2026-11-03', 1)).toBe(true);
    expect(await toggleHabit('h1', '2026-11-03', 2)).toBe(false);
    expect(await toggleHabit('h1', '2026-11-03', 3)).toBe(true);
    const logs = await db.habitLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ habitId: 'h1', date: '2026-11-03', done: true, updatedAt: 3 });
  });

  it('дубликаты за день схлопываются в одну запись', async () => {
    await db.habitLogs.bulkAdd([
      newRecord({ habitId: 'h1', date: '2026-11-03', done: true }, 1),
      newRecord({ habitId: 'h1', date: '2026-11-03', done: false }, 2),
    ]);
    expect(await toggleHabit('h1', '2026-11-03', 5)).toBe(true);
    expect(await db.habitLogs.count()).toBe(1);
  });

  it('дубликаты с одинаковым updatedAt: переключается та отметка, что видна (последняя)', async () => {
    await db.habitLogs.bulkAdd([
      newRecord({ habitId: 'h2', date: '2026-11-03', done: false }, 1),
      newRecord({ habitId: 'h2', date: '2026-11-03', done: true }, 1),
    ]);
    const shown = doneDays(await db.habitLogs.toArray()).has('2026-11-03');
    expect(await toggleHabit('h2', '2026-11-03', 5)).toBe(!shown);
  });

  it('создание, изменение расписания целиком и архив', async () => {
    const id = await createHabit({ name: 'Йога', schedule: { kind: 'weekdays', weekdays: [1, 3] }, color: '#000' }, 10);
    await updateHabit(id, { name: 'Йога утром', schedule: { kind: 'daily' }, color: '#fff', essential: true }, 20);
    expect(await db.habits.get(id)).toMatchObject({
      name: 'Йога утром',
      essential: true,
      schedule: { kind: 'daily' },
      archived: false,
      updatedAt: 20,
    });
    expect((await db.habits.get(id))?.schedule).not.toHaveProperty('weekdays');
    await archiveHabit(id, 30);
    expect(await db.habits.get(id)).toMatchObject({ archived: true, updatedAt: 30 });
  });
});

describe('contract #275: habitLogs — the id is the habit and the day', () => {
  it('Given saveSleep, checkIns, habitLogs, mealLogs, weightLogs When создаётся запись Then её id — naturalId(...) — habitLogs', async () => {
    await toggleHabit('h1', '2026-11-03', 1);
    await toggleHabit('h1', '2026-11-04', 2);
    await toggleHabit('h2', '2026-11-03', 3);
    expect((await db.habitLogs.toArray()).map((l) => l.id).sort()).toEqual([
      naturalId('habitLog', 'h1', '2026-11-03'),
      naturalId('habitLog', 'h1', '2026-11-04'),
      naturalId('habitLog', 'h2', '2026-11-03'),
    ]);
    expect(await db.habitLogs.get('habitLog:h1:2026-11-03')).toEqual({
      id: 'habitLog:h1:2026-11-03',
      habitId: 'h1',
      date: '2026-11-03',
      done: true,
      createdAt: 1,
      updatedAt: 1,
    });

    // Later taps keep the record and its id.
    await toggleHabit('h1', '2026-11-03', 5);
    expect(await db.habitLogs.get('habitLog:h1:2026-11-03')).toMatchObject({ done: false, createdAt: 1, updatedAt: 5 });
    expect(await db.habitLogs.count()).toBe(3);
  });
});

describe('contract #274: транзакция модуля и syncOutbox', () => {
  it('Given любая readwrite-транзакция модуля When она меняет строки Then DBCore-middleware ядра пишет {table, key, updatedAt} в новую таблицу syncOutbox в той же транзакции; модули не меняются', async () => {
    await db.syncOutbox.clear();
    // toggleHabit opens `db.transaction('rw', db.habitLogs, …)` — it knows nothing about the outbox.
    await toggleHabit('h1', '2026-11-03', 1);
    const [log] = await db.habitLogs.toArray();

    const entries = await db.syncOutbox.toArray();
    expect(entries).toEqual([{ table: 'habitLogs', key: log!.id, updatedAt: expect.any(Number) }]);

    // A second change of the same row replaces its entry instead of adding one.
    await toggleHabit('h1', '2026-11-03', 2);
    expect(await db.syncOutbox.count()).toBe(1);
  });
});
