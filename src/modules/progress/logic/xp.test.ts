import { describe, expect, it } from 'vitest';
import { atLocalTime } from '../../../core/logging/sleepTime';
import { newRecord } from '../../../core/ids';
import { XP_RULES, levelFromXp, summarize, totalXp, xpEventsFrom, xpForLevel, type XpSources } from './xp';

const T = 1_000;
const empty: XpSources = {
  tasks: [],
  habitLogs: [],
  timeEntries: [],
  sleepLogs: [],
  workoutLogs: [],
  meditationSessions: [],
  cognitiveTests: [],
  mindSessions: [],
};
const day = (d: string) => atLocalTime(d, '10:00');

describe('опыт из таблиц блоков', () => {
  it('Given записи в таблицах блоков When считаю опыт Then сумма по правилам xp.ts за задачи, привычки, фокус, сон, тренировки, медитации и тесты', () => {
    const src: XpSources = {
      tasks: [
        newRecord({ title: 'a', priority: 4 as const, tags: [], completedAt: day('2026-11-03') }, T),
        newRecord({ title: 'b', priority: 4 as const, tags: [] }, T), // not done → 0
      ],
      habitLogs: [
        newRecord({ habitId: 'h', date: '2026-11-03', done: true }, T),
        newRecord({ habitId: 'h', date: '2026-11-02', done: false }, T), // not done → 0
      ],
      timeEntries: [
        newRecord(
          {
            categoryId: 'c',
            start: day('2026-11-03'),
            end: day('2026-11-03') + 10 * 60_000,
            date: '2026-11-03',
            source: 'pomodoro' as const,
          },
          T,
        ),
        newRecord({ categoryId: 'c', start: day('2026-11-03'), date: '2026-11-03', source: 'pomodoro' as const }, T), // running → 0
        newRecord(
          {
            categoryId: 'c',
            start: day('2026-11-03'),
            end: day('2026-11-03') + 1,
            date: '2026-11-03',
            source: 'timer' as const,
          },
          T,
        ), // plain timer → 0
      ],
      sleepLogs: [newRecord({ date: '2026-11-03', bedtime: 0, wakeTime: 1, quality: 3 }, T)],
      workoutLogs: [newRecord({ date: '2026-11-03', type: 'run', durationMin: 30, rpe: 5 }, T)],
      meditationSessions: [
        newRecord({ date: '2026-11-03', startedAt: 0, durationMin: 5, kind: 'breathing' as const, completed: true }, T),
        newRecord(
          { date: '2026-11-03', startedAt: 0, durationMin: 5, kind: 'breathing' as const, completed: false },
          T,
        ),
      ],
      cognitiveTests: [
        newRecord(
          {
            date: '2026-11-03',
            kind: 'pvt' as const,
            startedAt: 0,
            durationMs: 1,
            reactionTimesMs: [],
            lapses: 0,
            falseStarts: 0,
            medianRtMs: 0,
          },
          T,
        ),
      ],
      mindSessions: [newRecord({ date: '2026-11-03', kind: 'nback' as const, durationMs: 1, accuracyPct: 80 }, T)],
    };
    const r = XP_RULES;
    expect(totalXp(src)).toBe(r.task + r.habit + r.focus + r.sleep + r.workout + r.meditation + r.test * 2);
  });

  it('Given снятие отметки или удаление записи When данные изменились Then опыт пересчитан, призрачных начислений нет', () => {
    const log = newRecord({ habitId: 'h', date: '2026-11-03', done: true }, T);
    const before = totalXp({ ...empty, habitLogs: [log] });
    expect(before).toBe(XP_RULES.habit);
    expect(totalXp({ ...empty, habitLogs: [{ ...log, done: false }] })).toBe(0);
    expect(totalXp({ ...empty, habitLogs: [] })).toBe(0);
  });

  it('Given задача выполнена без даты-ключа When считаю Then событие получает локальный день completedAt', () => {
    const t = newRecord(
      { title: 'a', priority: 4 as const, tags: [], completedAt: atLocalTime('2026-11-03', '23:30') },
      T,
    );
    expect(xpEventsFrom({ ...empty, tasks: [t] })).toEqual([{ date: '2026-11-03', amount: XP_RULES.task }]);
  });
});

describe('фокус-сессии', () => {
  const pomo = (minutes: number) =>
    newRecord({ categoryId: 'c', start: 0, end: minutes * 60_000, date: '2026-11-03', source: 'pomodoro' as const }, T);
  it('Given помодоро короче 10 минут When считаю опыт Then 0; от 10 минут — XP_RULES.focus', () => {
    expect(totalXp({ ...empty, timeEntries: [pomo(9)] })).toBe(0);
    expect(totalXp({ ...empty, timeEntries: [pomo(10)] })).toBe(XP_RULES.focus);
  });
});

describe('уровни', () => {
  it('Given сумма опыта When считаю уровень Then стоимость уровня растёт, прогресс до следующего считается', () => {
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
    expect(xpForLevel(3)).toBeGreaterThan(xpForLevel(2));
    const need1 = xpForLevel(1);
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, needed: need1 });
    expect(levelFromXp(need1 - 1).level).toBe(1);
    expect(levelFromXp(need1)).toEqual({ level: 2, into: 0, needed: xpForLevel(2) });
    expect(levelFromXp(need1 + 7)).toEqual({ level: 2, into: 7, needed: xpForLevel(2) });
  });

  it('Given события When смотрю экран Then опыт за сегодня и за последние 7 дней', () => {
    const habit = (date: string) => newRecord({ habitId: 'h', date, done: true }, T);
    const s = summarize(
      {
        ...empty,
        habitLogs: [habit('2026-11-06'), habit('2026-11-06'), habit('2026-11-01'), habit('2026-10-30')],
      },
      '2026-11-06',
    );
    expect(s.today).toBe(2 * XP_RULES.habit);
    expect(s.week).toBe(3 * XP_RULES.habit); // 10-31 … 11-06 includes 11-01, excludes 10-30
    expect(s.total).toBe(4 * XP_RULES.habit);
  });

  it('Given пустая база When считаю Then уровень 1 и нули', () => {
    const s = summarize(empty, '2026-11-06');
    expect(s).toMatchObject({ total: 0, today: 0, week: 0, level: 1, into: 0 });
  });
});
