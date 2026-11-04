import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog, LifeEvent, Task, TimeEntry } from '../../../core/types';
import { eventBanner, focusSummary, habitsSummary, tasksSummary } from './summary';

const base = { createdAt: 0, updatedAt: 0 };

function task(over: Partial<Task>): Task {
  return { id: over.id ?? 't', title: over.id ?? 't', priority: 4, tags: [], ...base, ...over };
}

function habit(over: Partial<Habit>): Habit {
  return { id: over.id ?? 'h', name: over.id ?? 'h', schedule: { kind: 'daily' }, archived: false, ...base, ...over };
}

function log(habitId: string, date: string, done = true): HabitLog {
  return { id: `${habitId}-${date}`, habitId, date, done, ...base };
}

function entry(over: Partial<TimeEntry>): TimeEntry {
  return {
    id: over.id ?? 'e',
    categoryId: 'c',
    start: 0,
    end: 1,
    date: '2026-11-04',
    source: 'timer',
    ...base,
    ...over,
  };
}

const ielts: LifeEvent = {
  id: 'ielts',
  title: 'IELTS',
  type: 'exam',
  date: '2026-11-07',
  importance: 3,
  prepDays: 7,
  ...base,
};

describe('eventBanner', () => {
  it('Given активное событие IELTS через 3 дня When я открываю «Сегодня» Then вверху «IELTS через 3 дня · Подготовка»', () => {
    expect(eventBanner(ielts, 'prep', '2026-11-04')).toBe('IELTS через 3 дня · Подготовка');
  });

  it('names the other phases', () => {
    expect(eventBanner(ielts, 'taper', '2026-11-06')).toBe('IELTS завтра · Разгрузка');
    expect(eventBanner(ielts, 'event', '2026-11-07')).toBe('IELTS сегодня · День события');
    expect(eventBanner(ielts, 'recovery', '2026-11-08')).toBe('IELTS вчера · Восстановление');
  });
});

describe('tasksSummary', () => {
  const today = '2026-11-04';

  it('Given задачи на сегодня с оценками When экран открыт Then план X / ёмкость Y мин и топ-3 задачи (фокус-проект первым)', () => {
    const tasks = [
      task({ id: 'urgent', priority: 1, dueDate: today, estimateMin: 60 }),
      task({ id: 'overdue', priority: 3, dueDate: '2026-11-02', estimateMin: 30 }),
      task({ id: 'english', priority: 4, dueDate: today, estimateMin: 45, projectId: 'eng' }),
      task({ id: 'later', priority: 2, dueDate: '2026-11-05', estimateMin: 120 }),
      task({ id: 'done', priority: 1, dueDate: today, estimateMin: 90, completedAt: 1 }),
      task({ id: 'noEstimate', priority: 2, dueDate: today }),
    ];
    const s = tasksSummary(tasks, today, 'eng');
    expect(s.plannedMin).toBe(135);
    expect(s.count).toBe(4);
    expect(s.top.map((t) => t.id)).toEqual(['english', 'overdue', 'urgent']);
  });

  it('orders by overdue, priority and time when there is no focus project', () => {
    const tasks = [
      task({ id: 'p2late', priority: 2, dueDate: today, dueTime: '18:00' }),
      task({ id: 'p2early', priority: 2, dueDate: today, dueTime: '09:00' }),
      task({ id: 'p1', priority: 1, dueDate: today }),
      task({ id: 'p4', priority: 4, dueDate: today }),
    ];
    expect(tasksSummary(tasks, today, undefined).top.map((t) => t.id)).toEqual(['p1', 'p2early', 'p2late']);
  });

  it('is empty without tasks due today', () => {
    expect(tasksSummary([task({ dueDate: '2026-11-10' }), task({ id: 'inbox' })], today, undefined)).toEqual({
      plannedMin: 0,
      count: 0,
      top: [],
    });
  });
});

describe('habitsSummary', () => {
  const today = '2026-11-04'; // Wednesday

  it('Given привычки на сегодня When экран открыт Then «Привычки: 3 из 5»', () => {
    const habits = [
      habit({ id: 'a' }),
      habit({ id: 'b' }),
      habit({ id: 'c' }),
      habit({ id: 'd', schedule: { kind: 'weekdays', weekdays: [3] } }),
      habit({ id: 'e', schedule: { kind: 'weekdays', weekdays: [1, 3, 5] } }),
      habit({ id: 'monday', schedule: { kind: 'weekdays', weekdays: [1] } }),
      habit({ id: 'archived', archived: true }),
    ];
    const logs = [log('a', today), log('b', today), log('d', today), log('c', today, false), log('a', '2026-11-03')];
    expect(habitsSummary(habits, logs, today)).toEqual({ done: 3, total: 5 });
  });

  it('counts a times-per-week habit while the weekly goal is not met yet, or if done today', () => {
    const weekly = habit({ id: 'w', schedule: { kind: 'timesPerWeek', timesPerWeek: 2 } });
    // Monday 2 Nov starts the week.
    expect(habitsSummary([weekly], [log('w', '2026-11-02')], today)).toEqual({ done: 0, total: 1 });
    expect(habitsSummary([weekly], [log('w', '2026-11-02'), log('w', '2026-11-03')], today)).toEqual({
      done: 0,
      total: 0,
    });
    expect(habitsSummary([weekly], [log('w', '2026-11-02'), log('w', today)], today)).toEqual({
      done: 1,
      total: 1,
    });
    // Last week's logs do not count.
    expect(habitsSummary([weekly], [log('w', '2026-10-31'), log('w', '2026-11-01')], today)).toEqual({
      done: 0,
      total: 1,
    });
  });
});

describe('focusSummary', () => {
  it('Given идёт таймер или были фокус-сессии When экран открыт Then идущий таймер или «Фокус: 2 из 6»', () => {
    const entries = [
      entry({ id: 'p1', source: 'pomodoro' }),
      entry({ id: 'p2', source: 'pomodoro' }),
      entry({ id: 'yesterday', source: 'pomodoro', date: '2026-11-03' }),
      entry({ id: 'manual', source: 'manual' }),
      entry({ id: 'running', end: undefined, start: 5000 }),
    ];
    const s = focusSummary(entries, '2026-11-04');
    expect(s.sessions).toBe(2);
    expect(s.running?.id).toBe('running');
  });

  it('has no running timer when every entry is finished', () => {
    expect(focusSummary([entry({})], '2026-11-04')).toEqual({ sessions: 0, running: undefined });
  });
});
