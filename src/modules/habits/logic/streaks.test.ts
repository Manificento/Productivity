import { describe, expect, it } from 'vitest';
import { shiftDateKey } from '../../../core/dates';
import type { HabitLog, HabitSchedule } from '../../../core/types';
import { completionRate, streak } from './streaks';

const TODAY = '2026-11-05'; // Thursday

let seq = 0;
const logs = (dates: string[], done = true): HabitLog[] =>
  dates.map((date) => ({ id: `l${++seq}`, habitId: 'h', date, done, createdAt: 0, updatedAt: seq }));

/** `n` consecutive days ending `n`-th day before `end` … `end`. */
const daysBack = (end: string, n: number) => Array.from({ length: n }, (_, i) => shiftDateKey(end, -i));

const daily: HabitSchedule = { kind: 'daily' };
const threePerWeek: HabitSchedule = { kind: 'timesPerWeek', timesPerWeek: 3 };

describe('streak', () => {
  it('ежедневная привычка, выполнена 5 дней подряд до сегодня, сегодня не отмечена: текущая серия = 5', () => {
    const h = { schedule: daily, logs: logs(daysBack('2026-11-04', 5)), since: '2026-10-01' };
    expect(streak(h, TODAY)).toEqual({ current: 5, best: 5, unit: 'days' });
  });

  it('сегодня отмечена — серия включает сегодня', () => {
    const h = { schedule: daily, logs: logs(daysBack(TODAY, 6)), since: '2026-10-01' };
    expect(streak(h, TODAY).current).toBe(6);
  });

  it('пропуск запланированного дня: серия обнуляется, лучшая серия сохраняется', () => {
    // done 10/20–10/29 (10 days), missed 10/30, done 10/31–11/02 (3 days), missed 11/03–11/04
    const h = {
      schedule: daily,
      logs: [...logs(daysBack('2026-10-29', 10)), ...logs(daysBack('2026-11-02', 3))],
      since: '2026-10-20',
    };
    expect(streak(h, TODAY)).toEqual({ current: 0, best: 10, unit: 'days' });
  });

  it('отметка «не выполнено» — тоже пропуск', () => {
    const h = { schedule: daily, logs: [...logs(['2026-11-03']), ...logs(['2026-11-04'], false)], since: '2026-11-03' };
    expect(streak(h, TODAY)).toMatchObject({ current: 0, best: 1 });
  });

  it('незапланированные дни серию не прерывают', () => {
    // пн, ср, пт: done Mon 11/02, Wed 11/04; Tue is not scheduled; Thu today is not scheduled
    const h = {
      schedule: { kind: 'weekdays' as const, weekdays: [1, 3, 5] },
      logs: logs(['2026-10-30', '2026-11-02', '2026-11-04']),
      since: '2026-10-30',
    };
    expect(streak(h, TODAY)).toEqual({ current: 3, best: 3, unit: 'days' });
  });

  it('привычка «3 раза в неделю»: серия считается в неделях (пн–вс) с выполненной нормой', () => {
    const h = {
      schedule: threePerWeek,
      logs: logs([
        // week of 10/12: only 2 — missed
        '2026-10-12',
        '2026-10-14',
        // week of 10/19: 3 — done
        '2026-10-19',
        '2026-10-21',
        '2026-10-25',
        // week of 10/26: 4 — done
        '2026-10-26',
        '2026-10-27',
        '2026-10-28',
        '2026-11-01',
        // current week 11/02: 1 so far — pending, does not break
        '2026-11-03',
      ]),
      since: '2026-10-12',
    };
    expect(streak(h, TODAY)).toEqual({ current: 2, best: 2, unit: 'weeks' });
  });

  it('«3 раза в неделю»: норма текущей недели уже выполнена — неделя засчитана', () => {
    const h = { schedule: threePerWeek, logs: logs(['2026-11-02', '2026-11-03', '2026-11-04']), since: '2026-11-02' };
    expect(streak(h, TODAY)).toEqual({ current: 1, best: 1, unit: 'weeks' });
  });

  it('«3 раза в неделю»: неделя без нормы обнуляет серию', () => {
    const h = {
      schedule: threePerWeek,
      logs: logs(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-27']),
      since: '2026-10-19',
    };
    expect(streak(h, TODAY)).toEqual({ current: 0, best: 1, unit: 'weeks' });
  });

  it('привычка из будущего или без записей — нули', () => {
    expect(streak({ schedule: daily, logs: [], since: '2026-11-10' }, TODAY)).toEqual({
      current: 0,
      best: 0,
      unit: 'days',
    });
    expect(streak({ schedule: daily, logs: [], since: TODAY }, TODAY)).toEqual({ current: 0, best: 0, unit: 'days' });
  });
});

describe('completionRate', () => {
  it('ежедневная привычка, выполнена 21 из 30 последних дней: 70%', () => {
    const last30 = daysBack('2026-11-04', 30); // today not done yet → window ends yesterday
    const h = { schedule: daily, logs: logs(last30.slice(0, 21)), since: '2026-01-01' };
    expect(completionRate(h, TODAY)).toBe(70);
  });

  it('сегодня выполнено — окно 30 дней заканчивается сегодня', () => {
    const h = { schedule: daily, logs: logs(daysBack(TODAY, 30)), since: '2026-01-01' };
    expect(completionRate(h, TODAY)).toBe(100);
  });

  it('окно не раньше дня создания привычки', () => {
    const h = { schedule: daily, logs: logs(['2026-11-02', '2026-11-03']), since: '2026-11-01' };
    expect(completionRate(h, TODAY)).toBe(50); // 11/01–11/04: 2 of 4
  });

  it('расписание по дням недели: учитываются только запланированные дни', () => {
    // пн, ср, пт between 10/30 and 11/04: Fri 10/30, Mon 11/02, Wed 11/04 — 2 done
    const h = {
      schedule: { kind: 'weekdays' as const, weekdays: [1, 3, 5] },
      logs: logs(['2026-11-02', '2026-11-04', '2026-11-03']),
      since: '2026-10-30',
    };
    expect(completionRate(h, TODAY)).toBe(67);
  });

  it('«3 раза в неделю»: выполненные дни к норме за период, не больше 100%', () => {
    const h28 = {
      schedule: threePerWeek,
      logs: logs(daysBack('2026-11-04', 28).filter((_, i) => i % 2 === 0)),
      since: '2026-10-08',
    };
    expect(completionRate(h28, TODAY, 28)).toBe(100); // 14 done vs quota 12 → capped
    const half = {
      schedule: threePerWeek,
      logs: logs(['2026-11-02', '2026-10-28', '2026-10-21']),
      since: '2026-10-08',
    };
    expect(completionRate(half, TODAY, 28)).toBe(25); // 3 of 12
  });

  it('привычка создана сегодня и не отмечена — 0%', () => {
    expect(completionRate({ schedule: daily, logs: [], since: TODAY }, TODAY)).toBe(0);
    expect(completionRate({ schedule: { kind: 'weekdays', weekdays: [] }, logs: [], since: '2026-10-01' }, TODAY)).toBe(
      0,
    );
  });
});
