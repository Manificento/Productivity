import { describe, expect, it } from 'vitest';
import type { DailyTargets } from '../../../core/adaptation/types';
import { newRecord } from '../../../core/ids';
import { atLocalTime } from '../../../core/logging/sleepTime';
import { QUEST_BONUS_XP, questsFor, type QuestData } from './quests';

const T = 1;
const DAY = '2026-11-06';
const targets = (over: Partial<DailyTargets> = {}): DailyTargets =>
  ({
    date: DAY,
    phase: 'normal',
    taskCapacityMin: 240,
    allowDeferLowPriority: false,
    sleepHours: 8,
    bedtime: '23:00',
    maxWorkoutIntensity: 'hard',
    focusPomodoros: 2,
    meditationMin: 10,
    caffeineCutoff: '14:00',
    noNewFoods: false,
    habitsMode: 'all',
    wakeTime: '07:00',
    wakeWindowMin: 20,
    deload: false,
    meditationKind: 'breathing',
    mindTrainingMin: 10,
    reasons: [],
    ...over,
  }) as DailyTargets;
const empty: QuestData = {
  timeEntries: [],
  tasks: [],
  sleepLogs: [],
  meditationSessions: [],
  habits: [],
  habitLogs: [],
};
const pomo = (minutes: number, taskId?: string) =>
  newRecord(
    {
      categoryId: 'c',
      ...(taskId ? { taskId } : {}),
      start: atLocalTime(DAY, '10:00'),
      end: atLocalTime(DAY, '10:00') + minutes * 60_000,
      date: DAY,
      source: 'pomodoro' as const,
    },
    T,
  );
const med = (minutes: number, completed = true, kind: 'breathing' | 'focus' = 'breathing') =>
  newRecord({ date: DAY, startedAt: 0, durationMin: minutes, kind, completed }, T);

describe('квесты дня', () => {
  it('Given цели дня When я открываю «Квесты» Then три квеста из DailyTargets', () => {
    const q = questsFor(targets(), empty, { projectName: 'Экзамен' });
    expect(q.map((x) => x.id)).toEqual(['focus', 'bedtime', 'meditation']);
    expect(q.map((x) => x.title)).toEqual(['2 фокус-сессии на проект «Экзамен»', 'Отбой до 23:00', 'Медитация 10 мин']);
    expect(q.every((x) => !x.done)).toBe(true);
    expect(QUEST_BONUS_XP).toBeGreaterThan(0);
  });

  it('Given нет проекта и нулевая медитация When строю квесты Then три квеста добираются привычками', () => {
    const q = questsFor(targets({ meditationMin: 0, focusPomodoros: 1 }), empty);
    expect(q.map((x) => x.id)).toEqual(['focus', 'bedtime', 'habits']);
    expect(q[0]?.title).toBe('1 фокус-сессия');
  });

  it('Given фаза event When я смотрю квесты Then только «ключевые привычки» и «дыхание 5 мин», без тренировок', () => {
    const q = questsFor(targets({ phase: 'event', habitsMode: 'essential', maxWorkoutIntensity: 'rest' }), empty);
    expect(q.map((x) => x.title)).toEqual(['Ключевые привычки', 'Дыхание 5 мин']);
  });

  it('Given квест фокуса When сессии ≥ 10 мин по проекту набрали цель Then он выполнен; короткие и чужие не считаются', () => {
    const task = newRecord({ title: 't', priority: 4 as const, tags: [], projectId: 'exam' }, T);
    const other = newRecord({ title: 'o', priority: 4 as const, tags: [], projectId: 'x' }, T);
    const t = targets({ focusProjectId: 'exam' });
    const done = (entries: QuestData['timeEntries']) =>
      questsFor(t, { ...empty, tasks: [task, other], timeEntries: entries })[0]?.done;
    expect(done([pomo(25, task.id), pomo(25, task.id)])).toBe(true);
    expect(done([pomo(25, task.id), pomo(5, task.id)])).toBe(false);
    expect(done([pomo(25, task.id), pomo(25, other.id)])).toBe(false);
    // no project in the targets → any focus session counts
    expect(questsFor(targets(), { ...empty, timeEntries: [pomo(25), pomo(25)] })[0]?.done).toBe(true);
  });

  it('Given отбой When ночной сон записан на следующее утро Then квест выполнен, если легли не позже цели', () => {
    const log = (bed: string, bedDay: string) =>
      newRecord(
        {
          date: '2026-11-07',
          bedtime: atLocalTime(bedDay, bed),
          wakeTime: atLocalTime('2026-11-07', '07:00'),
          quality: 3,
        },
        T,
      );
    const bedtimeDone = (l: ReturnType<typeof log>) =>
      questsFor(targets(), { ...empty, sleepLogs: [l] }).find((x) => x.id === 'bedtime')?.done;
    expect(bedtimeDone(log('22:50', DAY))).toBe(true);
    expect(bedtimeDone(log('23:00', DAY))).toBe(true);
    expect(bedtimeDone(log('23:30', DAY))).toBe(false);
    expect(bedtimeDone(log('00:30', '2026-11-07'))).toBe(false);
  });

  it('Given медитация When завершённые сессии дня набрали минуты Then квест выполнен; прерванные не считаются', () => {
    const d = (sessions: QuestData['meditationSessions']) =>
      questsFor(targets(), { ...empty, meditationSessions: sessions }).find((x) => x.id === 'meditation')?.done;
    expect(d([med(10)])).toBe(true);
    expect(d([med(5), med(5)])).toBe(true);
    expect(d([med(10, false)])).toBe(false);
    expect(d([med(5)])).toBe(false);
  });

  it('Given фаза event When есть дыхание ≥ 5 мин и ключевые привычки отмечены Then оба квеста выполнены', () => {
    const ess = newRecord({ name: 'a', schedule: { kind: 'daily' as const }, archived: false, essential: true }, T);
    const other = newRecord({ name: 'b', schedule: { kind: 'daily' as const }, archived: false }, T);
    const log = newRecord({ habitId: ess.id, date: DAY, done: true }, T);
    const q = questsFor(targets({ phase: 'event', habitsMode: 'essential' }), {
      ...empty,
      habits: [ess, other],
      habitLogs: [log],
      meditationSessions: [med(5)],
    });
    expect(q.map((x) => x.done)).toEqual([true, true]);
    // a day-of-week habit not scheduled today is ignored; with no habits the quest is not done
    expect(questsFor(targets({ phase: 'event' }), empty)[0]?.done).toBe(false);
  });

  it('Given привычка «N раз в неделю» с выполненной целью When считаю квест Then она не блокирует «Привычки дня»', () => {
    const daily = newRecord({ name: 'a', schedule: { kind: 'daily' as const }, archived: false }, T);
    const weekly = newRecord(
      { name: 'w', schedule: { kind: 'timesPerWeek' as const, timesPerWeek: 1 }, archived: false },
      T,
    );
    // 2026-11-06 is a Friday; the weekly goal (1) was met on Monday
    const logs = [
      newRecord({ habitId: weekly.id, date: '2026-11-02', done: true }, T),
      newRecord({ habitId: daily.id, date: DAY, done: true }, T),
    ];
    const q = questsFor(targets({ meditationMin: 0, focusPomodoros: 0 }), {
      ...empty,
      habits: [daily, weekly],
      habitLogs: logs,
    });
    expect(q.find((x) => x.id === 'habits')?.done).toBe(true);
  });

  it('Given отметка снята позже When считаю квест Then привычка не засчитана (побеждает последняя запись)', () => {
    const h = newRecord({ name: 'a', schedule: { kind: 'daily' as const }, archived: false }, T);
    const on = newRecord({ habitId: h.id, date: DAY, done: true }, 10);
    const off = { ...newRecord({ habitId: h.id, date: DAY, done: false }, 20) };
    const q = questsFor(targets({ meditationMin: 0, focusPomodoros: 0 }), {
      ...empty,
      habits: [h],
      habitLogs: [on, off],
    });
    expect(q.find((x) => x.id === 'habits')?.done).toBe(false);
  });

  it('Given квесты без данных When смотрю подсказки Then отбой «засчитается утром», у ключевых привычек — как их отметить', () => {
    const q = questsFor(targets(), empty);
    expect(q.find((x) => x.id === 'bedtime')?.hint).toMatch(/утром/);
    const e = questsFor(targets({ phase: 'event' }), empty);
    expect(e[0]?.hint).toMatch(/Привычках/);
  });
});
