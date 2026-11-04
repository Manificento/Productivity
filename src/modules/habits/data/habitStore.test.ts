import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
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

  it('создание, изменение расписания целиком и архив', async () => {
    const id = await createHabit({ name: 'Йога', schedule: { kind: 'weekdays', weekdays: [1, 3] }, color: '#000' }, 10);
    await updateHabit(id, { name: 'Йога утром', schedule: { kind: 'daily' }, color: '#fff' }, 20);
    expect(await db.habits.get(id)).toMatchObject({
      name: 'Йога утром',
      schedule: { kind: 'daily' },
      archived: false,
      updatedAt: 20,
    });
    expect((await db.habits.get(id))?.schedule).not.toHaveProperty('weekdays');
    await archiveHabit(id, 30);
    expect(await db.habits.get(id)).toMatchObject({ archived: true, updatedAt: 30 });
  });
});
