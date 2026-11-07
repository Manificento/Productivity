import { describe, expect, it } from 'vitest';
import { atLocalTime } from '../../../core/logging/sleepTime';
import { newRecord } from '../../../core/ids';
import {
  DAILY_XP_CAP,
  XP_RULES,
  levelFromXp,
  skillLevels,
  summarize,
  totalXp,
  xpEventsFrom,
  xpForLevel,
  type XpSources,
} from './xp';

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
  mealLogs: [],
  xpEvents: [],
};
const day = (d: string) => atLocalTime(d, '10:00');

describe('опыт из таблиц блоков', () => {
  it('Given записи в таблицах блоков When считаю опыт Then сумма по правилам xp.ts за задачи, привычки, фокус, сон, тренировки, медитации и тесты', () => {
    const src: XpSources = {
      mealLogs: [],
      xpEvents: [],
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
    expect(xpEventsFrom({ ...empty, tasks: [t] })).toEqual([
      { date: '2026-11-03', skill: 'tasks', amount: XP_RULES.task },
    ]);
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

describe('навыки', () => {
  it('Given опыт по источникам When я открываю «Навыки» Then шесть навыков — Дела, Тело, Сон, Питание, Ум, Покой — с уровнями по вкладу блоков', () => {
    const levels = skillLevels({
      ...empty,
      workoutLogs: Array.from({ length: 7 }, (_, i) =>
        newRecord({ date: `2026-11-0${i + 1}`, type: 'run', durationMin: 30, rpe: 5 }, T),
      ),
      mealLogs: [newRecord({ date: '2026-11-03', time: 0, kind: 'lunch' as const, items: [] }, T)],
      mindSessions: [newRecord({ date: '2026-11-03', kind: 'nback' as const, durationMs: 1, accuracyPct: 80 }, T)],
      xpEvents: [newRecord({ date: '2026-11-03', source: 'quest' as const, questId: 'bedtime', amount: 20 }, T)],
    });
    expect(levels.map((l) => l.label)).toEqual(['Дела', 'Тело', 'Сон', 'Питание', 'Ум', 'Покой']);
    const by = Object.fromEntries(levels.map((l) => [l.id, l]));
    expect(by.body).toMatchObject({ xp: 7 * XP_RULES.workout, level: 2 });
    expect(by.food).toMatchObject({ xp: XP_RULES.meal, level: 1 });
    expect(by.mind?.xp).toBe(XP_RULES.test);
    expect(by.sleep?.xp).toBe(20); // quest bonus flows into the quest's skill
    expect(by.tasks?.xp).toBe(0);
  });
});

describe('опыт от импортированной истории (#224)', () => {
  const imported = (date: string, i: number) =>
    newRecord(
      {
        title: `t${i}`,
        priority: 4 as const,
        tags: [],
        completedAt: day(date),
        source: 'todoist' as const,
        externalId: `e${i}`,
      },
      T,
    );
  const history = (days: number, perDay: number): XpSources => ({
    ...empty,
    tasks: Array.from({ length: days }, (_, d) =>
      Array.from({ length: perDay }, (_, i) => imported(`2026-01-${String(d + 1).padStart(2, '0')}`, d * 100 + i)),
    ).flat(),
  });

  it('Given импорт задач When считаю Then за день засчитывается не больше DAILY_XP_CAP', () => {
    expect(totalXp(history(1, 50))).toBe(DAILY_XP_CAP);
    expect(totalXp(history(30, 50))).toBe(30 * DAILY_XP_CAP);
    expect(totalXp(history(3, 2))).toBe(3 * 2 * XP_RULES.task); // below the cap nothing is lost
  });

  it('Given 300 задач за 12 месяцев When считаю Then уровень не максимальный и растёт от числа активных дней', () => {
    const year = history(12, 25); // 300 tasks over 12 days stand in for 12 active days
    expect(totalXp(year)).toBe(12 * DAILY_XP_CAP);
    expect(levelFromXp(totalXp(year)).level).toBeLessThan(10);
  });

  it('Given импорт When смотрю сводку Then перенесённый опыт отдельно от живого', () => {
    const live = newRecord({ title: 'x', priority: 4 as const, tags: [], completedAt: day('2026-02-01') }, T);
    const src = { ...history(2, 50), tasks: [...history(2, 50).tasks, live] };
    const s = summarize(src, '2026-02-01');
    expect(s.imported).toBe(2 * DAILY_XP_CAP);
    expect(s.total).toBe(2 * DAILY_XP_CAP + XP_RULES.task);
  });

  it('Given повторный импорт тех же записей When считаю Then опыт не удваивается (считается из таблиц)', () => {
    const once = history(2, 5);
    expect(totalXp({ ...once, tasks: once.tasks })).toBe(totalXp(once));
    expect(totalXp(once)).toBe(10 * XP_RULES.task);
  });

  it('Given импорт When считаю бонусы Then квесты за прошлые дни не создаются, только записанные xpEvents учитываются без потолка', () => {
    expect(xpEventsFrom(history(2, 5)).some((g) => g.bonus)).toBe(false);
    const quest = newRecord(
      { date: '2026-01-01', source: 'quest' as const, questId: 'focus', amount: XP_RULES.quest },
      T,
    );
    expect(totalXp({ ...history(1, 50), xpEvents: [quest] })).toBe(DAILY_XP_CAP + XP_RULES.quest);
  });

  it('Given живые действия сверх потолка When считаю Then потолок тот же и живое идёт раньше импорта', () => {
    const live = Array.from({ length: 12 }, (_, i) =>
      newRecord({ title: `l${i}`, priority: 4 as const, tags: [], completedAt: day('2026-01-01') }, T),
    );
    const s = summarize({ ...empty, tasks: [...live, imported('2026-01-01', 1)] }, '2026-01-01');
    expect(s.total).toBe(DAILY_XP_CAP);
    expect(s.imported).toBe(0);
  });
});
