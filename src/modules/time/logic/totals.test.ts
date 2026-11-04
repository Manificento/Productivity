import { describe, expect, it } from 'vitest';
import { atLocalTime } from '../../../core/logging/sleepTime';
import type { TimeEntry } from '../../../core/types';
import { dayTotals, splitByDay, startTimer, weekTotals } from './totals';

const MIN = 60_000;

const at = (day: string, hhmm: string) => atLocalTime(day, hhmm);

let seq = 0;
const entry = (over: Partial<TimeEntry> & Pick<TimeEntry, 'start'>): TimeEntry => ({
  id: `t${++seq}`,
  createdAt: 0,
  updatedAt: 0,
  categoryId: 'work',
  date: '2026-11-02',
  source: 'timer',
  ...over,
});

describe('splitByDay', () => {
  it('запись 23:30–00:30: 30 мин идут в первый день и 30 мин во второй', () => {
    const e = entry({ start: at('2026-11-02', '23:30'), end: at('2026-11-03', '00:30') });
    expect(splitByDay(e, at('2026-11-04', '12:00'))).toEqual([
      { date: '2026-11-02', ms: 30 * MIN },
      { date: '2026-11-03', ms: 30 * MIN },
    ]);
  });

  it('запись внутри одного дня даёт один кусок', () => {
    const e = entry({ start: at('2026-11-02', '09:00'), end: at('2026-11-02', '10:15') });
    expect(splitByDay(e, at('2026-11-04', '12:00'))).toEqual([{ date: '2026-11-02', ms: 75 * MIN }]);
  });

  it('запись через несколько суток делится по каждой полуночи', () => {
    const e = entry({ start: at('2026-11-02', '22:00'), end: at('2026-11-04', '01:00') });
    expect(splitByDay(e, at('2026-11-05', '12:00'))).toEqual([
      { date: '2026-11-02', ms: 120 * MIN },
      { date: '2026-11-03', ms: 24 * 60 * MIN },
      { date: '2026-11-04', ms: 60 * MIN },
    ]);
  });

  it('идущий таймер считается до now', () => {
    const e = entry({ start: at('2026-11-02', '23:00') });
    expect(splitByDay(e, at('2026-11-03', '00:20'))).toEqual([
      { date: '2026-11-02', ms: 60 * MIN },
      { date: '2026-11-03', ms: 20 * MIN },
    ]);
  });

  it('пустая или перевёрнутая запись и таймер из будущего не дают времени', () => {
    const now = at('2026-11-02', '12:00');
    expect(splitByDay(entry({ start: now, end: now }), now)).toEqual([]);
    expect(splitByDay(entry({ start: now, end: now - MIN }), now)).toEqual([]);
    expect(splitByDay(entry({ start: now + MIN }), now)).toEqual([]);
  });
});

describe('dayTotals', () => {
  it('записи разных категорий: суммы по категориям верны, идущий таймер считается до now', () => {
    const now = at('2026-11-02', '18:30');
    const entries = [
      entry({ categoryId: 'work', start: at('2026-11-02', '09:00'), end: at('2026-11-02', '11:00') }),
      entry({ categoryId: 'study', start: at('2026-11-02', '12:00'), end: at('2026-11-02', '12:45') }),
      entry({ categoryId: 'work', start: at('2026-11-02', '14:00'), end: at('2026-11-02', '15:30') }),
      entry({ categoryId: 'sport', start: at('2026-11-02', '18:00') }), // running
      entry({
        categoryId: 'work',
        date: '2026-11-01',
        start: at('2026-11-01', '10:00'),
        end: at('2026-11-01', '12:00'),
      }),
    ];
    expect(dayTotals(entries, '2026-11-02', now)).toEqual({
      work: 210 * MIN,
      study: 45 * MIN,
      sport: 30 * MIN,
    });
  });

  it('запись через полночь делится между днями: каждому дню своя часть', () => {
    const entries = [entry({ start: at('2026-11-01', '23:30'), end: at('2026-11-02', '00:30') })];
    expect(dayTotals(entries, '2026-11-01', at('2026-11-02', '12:00'))).toEqual({ work: 30 * MIN });
    expect(dayTotals(entries, '2026-11-02', at('2026-11-02', '12:00'))).toEqual({ work: 30 * MIN });
  });

  it('пустой день — пустой итог', () => {
    expect(dayTotals([], '2026-11-02', at('2026-11-02', '12:00'))).toEqual({});
  });
});

describe('weekTotals', () => {
  it('неделя пн–вс: учитываются только записи этой недели', () => {
    // 2026-11-02 — понедельник, 2026-11-08 — воскресенье
    const now = at('2026-11-10', '12:00');
    const entries = [
      entry({ categoryId: 'work', start: at('2026-11-01', '10:00'), end: at('2026-11-01', '11:00') }), // вс прошлой недели
      entry({ categoryId: 'work', start: at('2026-11-02', '10:00'), end: at('2026-11-02', '11:00') }), // пн
      entry({ categoryId: 'study', start: at('2026-11-05', '10:00'), end: at('2026-11-05', '10:30') }), // чт
      entry({ categoryId: 'work', start: at('2026-11-08', '20:00'), end: at('2026-11-08', '21:00') }), // вс
      entry({ categoryId: 'work', start: at('2026-11-09', '10:00'), end: at('2026-11-09', '11:00') }), // пн следующей
    ];
    const expected = { work: 120 * MIN, study: 30 * MIN };
    expect(weekTotals(entries, '2026-11-02', now)).toEqual(expected);
    expect(weekTotals(entries, '2026-11-05', now)).toEqual(expected);
    expect(weekTotals(entries, '2026-11-08', now)).toEqual(expected);
  });

  it('запись через полночь на границе недель делится между неделями', () => {
    const now = at('2026-11-10', '12:00');
    const entries = [entry({ start: at('2026-11-08', '23:00'), end: at('2026-11-09', '01:00') })];
    expect(weekTotals(entries, '2026-11-08', now)).toEqual({ work: 60 * MIN });
    expect(weekTotals(entries, '2026-11-09', now)).toEqual({ work: 60 * MIN });
  });
});

describe('startTimer', () => {
  it('идёт таймер A, запускается таймер B: возвращается завершение A в момент старта B', () => {
    const a = entry({ categoryId: 'work', start: at('2026-11-02', '09:00') });
    const done = entry({ categoryId: 'study', start: at('2026-11-02', '08:00'), end: at('2026-11-02', '08:30') });
    const startB = at('2026-11-02', '10:00');

    const result = startTimer([done, a], { categoryId: 'study', source: 'timer' }, startB);

    expect(result.finished).toEqual([{ ...a, end: startB }]);
    expect(result.started).toEqual({ categoryId: 'study', source: 'timer', start: startB, date: '2026-11-02' });
  });

  it('одновременно идёт максимум один: все идущие таймеры завершаются', () => {
    const a = entry({ start: at('2026-11-02', '09:00') });
    const b = entry({ start: at('2026-11-02', '09:30') });
    const startC = at('2026-11-02', '10:00');
    const { finished } = startTimer([a, b], { categoryId: 'sport', source: 'timer' }, startC);
    expect(finished.map((e) => e.end)).toEqual([startC, startC]);
  });

  it('таймер с началом позже старта нового не получает конец раньше начала', () => {
    const future = entry({ start: at('2026-11-02', '11:00') });
    const { finished } = startTimer([future], { categoryId: 'work', source: 'timer' }, at('2026-11-02', '10:00'));
    expect(finished[0]?.end).toBe(future.start);
  });

  it('без идущего таймера ничего не завершается; задача и дата старта переносятся', () => {
    const start = at('2026-11-02', '23:59');
    const result = startTimer([], { categoryId: 'study', taskId: 'task-1', source: 'pomodoro' }, start);
    expect(result.finished).toEqual([]);
    expect(result.started).toEqual({
      categoryId: 'study',
      taskId: 'task-1',
      source: 'pomodoro',
      start,
      date: '2026-11-02',
    });
  });
});
