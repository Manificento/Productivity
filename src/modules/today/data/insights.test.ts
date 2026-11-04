import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { loadInsightInput } from './insights';

const base = { createdAt: 0, updatedAt: 0 };
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

afterEach(async () => {
  await Promise.all([db.sleepLogs, db.tasks, db.timeEntries, db.workoutLogs, db.checkIns].map((t) => t.clear()));
});

describe('loadInsightInput', () => {
  it('turns the other blocks into per-day values (read-only)', async () => {
    await db.sleepLogs.add({
      id: 's',
      date: '2026-11-04',
      bedtime: at(3, 23),
      wakeTime: at(4, 7),
      quality: 3,
      ...base,
    });
    await db.tasks.bulkAdd([
      { id: 't1', title: 'a', priority: 1, tags: [], completedAt: at(4, 10), ...base },
      { id: 't2', title: 'b', priority: 1, tags: [], completedAt: at(4, 23, 50), ...base },
      { id: 't3', title: 'c', priority: 1, tags: [], completedAt: at(5, 0, 10), ...base },
      { id: 't4', title: 'open', priority: 1, tags: [], ...base },
    ]);
    await db.timeEntries.bulkAdd([
      {
        id: 'p1',
        categoryId: 'c',
        start: at(4, 9),
        end: at(4, 9, 25),
        date: '2026-11-04',
        source: 'pomodoro',
        ...base,
      },
      {
        id: 'p2',
        categoryId: 'c',
        start: at(4, 10),
        end: at(4, 10, 25),
        date: '2026-11-04',
        source: 'pomodoro',
        ...base,
      },
      { id: 'm', categoryId: 'c', start: at(4, 11), end: at(4, 12), date: '2026-11-04', source: 'manual', ...base },
      { id: 'run', categoryId: 'c', start: at(4, 13), date: '2026-11-04', source: 'pomodoro', ...base },
    ]);
    await db.workoutLogs.bulkAdd([
      { id: 'w1', date: '2026-11-04', type: 'Бег', durationMin: 30, rpe: 6, ...base },
      { id: 'w2', date: '2026-11-04', type: 'Сила', durationMin: 45, rpe: 7, ...base },
    ]);
    await db.checkIns.add({ id: 'c', date: '2026-11-05', energy: 4, focus: 3, ...base });

    const input = await loadInsightInput('2026-11-05');
    expect(input.sleep).toEqual({ '2026-11-04': 8 });
    expect(input.tasksDone).toEqual({ '2026-11-04': 2, '2026-11-05': 1 });
    expect(input.focusMin).toEqual({ '2026-11-04': 50 });
    expect(input.workoutMin).toEqual({ '2026-11-04': 75 });
    expect(input.energy).toEqual({ '2026-11-05': 4 });
  });

  it('ignores data older than the 60-day window', async () => {
    await db.sleepLogs.add({
      id: 's',
      date: '2026-08-01',
      bedtime: at(3, 23),
      wakeTime: at(4, 7),
      quality: 3,
      ...base,
    });
    expect((await loadInsightInput('2026-11-05')).sleep).toEqual({});
  });
});
