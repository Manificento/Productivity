import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { loadSummaryData } from './summary';

const base = { createdAt: 0, updatedAt: 0 };
const today = '2026-11-04';

beforeEach(async () => {
  await db.tasks.bulkAdd([
    { id: 'due', title: 'Эссе', priority: 1, dueDate: today, tags: [], ...base },
    { id: 'overdue', title: 'Отчёт', priority: 2, dueDate: '2026-11-01', tags: [], ...base },
    { id: 'future', title: 'Потом', priority: 1, dueDate: '2026-11-05', tags: [], ...base },
    { id: 'inbox', title: 'Входящие', priority: 1, tags: [], ...base },
    { id: 'done', title: 'Готово', priority: 1, dueDate: today, completedAt: 1, tags: [], ...base },
  ]);
  await db.habits.bulkAdd([
    { id: 'h1', name: 'Чтение', schedule: { kind: 'daily' }, archived: false, ...base },
    { id: 'h2', name: 'Старое', schedule: { kind: 'daily' }, archived: true, ...base },
  ]);
  await db.habitLogs.bulkAdd([
    { id: 'l1', habitId: 'h1', date: today, done: true, ...base },
    { id: 'l2', habitId: 'h1', date: '2026-11-02', done: true, ...base },
    { id: 'l3', habitId: 'h1', date: '2026-10-30', done: true, ...base },
  ]);
  await db.timeCategories.add({ id: 'study', name: 'Учёба', archived: false, ...base });
  await db.timeEntries.bulkAdd([
    { id: 'p1', categoryId: 'study', start: 1, end: 2, date: today, source: 'pomodoro', ...base },
    { id: 'run', categoryId: 'study', start: 3, date: '2026-11-03', source: 'timer', ...base },
    { id: 'old', categoryId: 'study', start: 1, end: 2, date: '2026-10-01', source: 'pomodoro', ...base },
  ]);
  await db.sleepLogs.add({ id: 's1', date: today, bedtime: 0, wakeTime: 8 * 3600_000, quality: 4, ...base });
  await db.workoutLogs.add({ id: 'w1', date: today, type: 'Бег', durationMin: 30, rpe: 6, ...base });
});

afterEach(clearAll);

describe('loadSummaryData', () => {
  it('reads only what the summary needs from every block', async () => {
    const d = await loadSummaryData(today);
    expect(d.tasks.map((t) => t.id).sort()).toEqual(['due', 'overdue']);
    expect(d.habits.map((h) => h.id)).toEqual(['h1']);
    expect(d.habitLogs.map((l) => l.id).sort()).toEqual(['l1', 'l2']);
    expect(d.timeEntries.map((e) => e.id).sort()).toEqual(['p1', 'run']);
    expect(d.categories).toEqual({ study: 'Учёба' });
    expect(d.sleepHours).toBe(8);
    expect(d.workouts.map((w) => w.id)).toEqual(['w1']);
  });

  it('works with empty tables', async () => {
    await clearAll();
    const d = await loadSummaryData(today);
    expect(d).toEqual({
      tasks: [],
      habits: [],
      habitLogs: [],
      timeEntries: [],
      categories: {},
      sleepHours: undefined,
      workouts: [],
    });
  });
});

async function clearAll() {
  await Promise.all(
    [db.tasks, db.habits, db.habitLogs, db.timeCategories, db.timeEntries, db.sleepLogs, db.workoutLogs].map((t) =>
      t.clear(),
    ),
  );
}
