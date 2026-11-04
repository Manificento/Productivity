import { describe, expect, it } from 'vitest';
import { fromDateKey, shiftDateKey, toDateKey } from '../../../core/dates';
import { buildDemoTables, DEMO_DAYS, DEMO_EVENT_IN_DAYS } from './demo';

const TODAY = '2026-11-04';
const NOW = new Date(2026, 10, 4, 10, 0).getTime();
const FIRST_DAY = shiftDateKey(TODAY, -(DEMO_DAYS - 1));

describe('demo data', () => {
  const t = buildDemoTables(TODAY, NOW);
  const inRange = (day: string) => day >= FIRST_DAY && day <= TODAY;

  it('Given today When demo data is built Then it holds 2 weeks of data of every block and an IELTS exam in 5 days', () => {
    const blocks = [
      'projects',
      'tasks',
      'habits',
      'habitLogs',
      'timeCategories',
      'timeEntries',
      'sleepLogs',
      'foods',
      'mealLogs',
      'workoutLogs',
      'checkIns',
      'cognitiveTests',
      'lifeEvents',
    ] as const;
    for (const name of blocks) expect(t[name].length, name).toBeGreaterThan(0);

    for (const rows of [t.habitLogs, t.timeEntries, t.sleepLogs, t.mealLogs, t.checkIns]) {
      expect(new Set(rows.map((r) => r.date))).toEqual(
        new Set(Array.from({ length: DEMO_DAYS }, (_, i) => shiftDateKey(FIRST_DAY, i))),
      );
    }
    expect(t.workoutLogs.every((w) => inRange(w.date))).toBe(true);
    expect(t.cognitiveTests.every((c) => inRange(c.date))).toBe(true);

    expect(DEMO_EVENT_IN_DAYS).toBe(5);
    expect(t.lifeEvents).toEqual([
      expect.objectContaining({ title: 'IELTS', type: 'exam', date: '2026-11-09', importance: 3, prepDays: 7 }),
    ]);
  });

  it('is deterministic for the same day', () => {
    expect(buildDemoTables(TODAY, NOW)).toEqual(t);
  });

  it('keeps one sleep record and one check-in per day, dated by the local day, with plausible values', () => {
    expect(t.sleepLogs).toHaveLength(DEMO_DAYS);
    for (const s of t.sleepLogs) {
      expect(toDateKey(s.wakeTime)).toBe(s.date);
      const hours = (s.wakeTime - s.bedtime) / 3_600_000;
      expect(hours).toBeGreaterThanOrEqual(5);
      expect(hours).toBeLessThanOrEqual(9.5);
      expect(s.quality).toBeGreaterThanOrEqual(1);
      expect(s.quality).toBeLessThanOrEqual(5);
    }
    expect(t.checkIns).toHaveLength(DEMO_DAYS);
  });

  it('time entries are finished, dated by their start and in the past', () => {
    for (const e of t.timeEntries) {
      expect(e.end).toBeGreaterThan(e.start);
      expect(toDateKey(e.start)).toBe(e.date);
      expect(e.end).toBeLessThanOrEqual(NOW);
    }
  });

  it('every reference points to an existing record and ids are unique', () => {
    const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
    const projects = ids(t.projects);
    const habits = ids(t.habits);
    const categories = ids(t.timeCategories);
    const foods = ids(t.foods);
    const tasks = ids(t.tasks);
    expect(t.tasks.every((x) => !x.projectId || projects.has(x.projectId))).toBe(true);
    expect(t.habitLogs.every((x) => habits.has(x.habitId))).toBe(true);
    expect(t.timeEntries.every((x) => categories.has(x.categoryId) && (!x.taskId || tasks.has(x.taskId)))).toBe(true);
    expect(t.mealLogs.every((m) => m.items.every((i) => foods.has(i.foodId)))).toBe(true);
    expect(t.lifeEvents.every((e) => !e.projectId || projects.has(e.projectId))).toBe(true);

    const all = Object.values(t)
      .flat()
      .flatMap((r) => ('id' in r ? [r.id] : []));
    expect(new Set(all).size).toBe(all.length);
  });

  it('there is something to do today: open tasks due today and today’s habits not all done yet', () => {
    expect(t.tasks.some((x) => x.dueDate === TODAY && x.completedAt === undefined)).toBe(true);
    expect(t.tasks.some((x) => x.completedAt !== undefined)).toBe(true);
    const todayLogs = t.habitLogs.filter((l) => l.date === TODAY);
    expect(todayLogs.length).toBeLessThan(t.habits.length);
  });

  it('loaded early in the morning, nothing is dated or stamped after now', () => {
    const early = new Date(2026, 10, 4, 6, 0).getTime();
    const rows = Object.values(buildDemoTables(TODAY, early)).flat();
    for (const r of rows) {
      if ('createdAt' in r) expect(r.createdAt, r.id).toBeLessThanOrEqual(early);
      if ('updatedAt' in r) expect(r.updatedAt, r.id).toBeLessThanOrEqual(early);
    }
  });

  it('the weekly «Уборка» is due on the next Saturday', () => {
    const cleaning = t.tasks.find((x) => x.title === 'Уборка');
    expect(cleaning?.dueDate).toBe('2026-11-07');
    expect(fromDateKey(cleaning!.dueDate!).getDay()).toBe(6);
  });
});
