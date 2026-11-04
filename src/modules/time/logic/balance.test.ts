import { describe, expect, it } from 'vitest';
import { atLocalTime } from '../../../core/logging/sleepTime';
import type { TimeCategory, TimeEntry } from '../../../core/types';
import { balance, formatDelta, formatHoursMinutes, weekStartMs } from './balance';

const MIN = 60_000;
const H = 60 * MIN;
const at = atLocalTime;

const cat = (id: string, name: string, archived = false): TimeCategory => ({
  id,
  name,
  archived,
  createdAt: 0,
  updatedAt: 0,
  color: '#000',
});

let seq = 0;
const entry = (categoryId: string, start: number, end?: number): TimeEntry => ({
  id: `e${++seq}`,
  createdAt: 0,
  updatedAt: 0,
  categoryId,
  start,
  ...(end === undefined ? {} : { end }),
  date: '2026-11-02',
  source: 'timer',
});

describe('formatHoursMinutes', () => {
  it.each([
    [0, '0 мин'],
    [59_999, '0 мин'],
    [45 * MIN, '45 мин'],
    [H, '1 ч'],
    [H + 20 * MIN, '1 ч 20 мин'],
    [26 * H + 5 * MIN, '26 ч 5 мин'],
  ])('%i мс → «%s»', (ms, text) => {
    expect(formatHoursMinutes(ms)).toBe(text);
  });
});

describe('formatDelta', () => {
  it('изменение «+1 ч 20 мин» / «−40 мин»', () => {
    expect(formatDelta(H + 20 * MIN)).toBe('+1 ч 20 мин');
    expect(formatDelta(-40 * MIN)).toBe('−40 мин');
    expect(formatDelta(30_000)).toBe('без изменений');
    expect(formatDelta(0)).toBe('без изменений');
  });
});

describe('weekStartMs', () => {
  it('неделя начинается в понедельник в локальную полночь', () => {
    expect(weekStartMs('2026-11-08')).toBe(at('2026-11-02', '00:00'));
    expect(weekStartMs('2026-11-02')).toBe(at('2026-11-02', '00:00'));
  });
});

describe('balance', () => {
  // Thursday 2026-11-05, 18:00. Week: Mon 2026-11-02 … Sun 2026-11-08.
  const now = at('2026-11-05', '18:00');
  const categories = [cat('study', 'Учёба'), cat('work', 'Работа'), cat('sport', 'Спорт'), cat('old', 'Старое', true)];

  it('итоги по категориям за день и за неделю, отсортированы по неделе', () => {
    const entries = [
      entry('work', at('2026-11-02', '09:00'), at('2026-11-02', '12:00')), // Mon 3h
      entry('study', at('2026-11-05', '10:00'), at('2026-11-05', '11:00')), // Thu 1h
      entry('study', at('2026-11-05', '17:30')), // running 30 min
      entry('old', at('2026-11-03', '10:00'), at('2026-11-03', '10:15')), // archived category still counted
    ];
    const b = balance(entries, categories, '2026-11-05', now);
    expect(b.day.map((r) => [r.name, r.ms])).toEqual([['Учёба', 90 * MIN]]);
    expect(b.week.map((r) => [r.name, r.ms])).toEqual([
      ['Работа', 3 * H],
      ['Учёба', 90 * MIN],
      ['Старое', 15 * MIN],
    ]);
    expect(b.dayTotal).toBe(90 * MIN);
    expect(b.weekTotal).toBe(3 * H + 105 * MIN);
  });

  it('есть прошлая неделя: у каждой категории изменение к тем же дням прошлой недели', () => {
    const entries = [
      // this week
      entry('work', at('2026-11-02', '09:00'), at('2026-11-02', '12:00')), // 3h
      entry('study', at('2026-11-04', '09:00'), at('2026-11-04', '10:00')), // 1h
      // last week, up to Thu 18:00
      entry('work', at('2026-10-27', '09:00'), at('2026-10-27', '10:40')), // 1h40
      entry('study', at('2026-10-28', '09:00'), at('2026-10-28', '10:40')), // 1h40
      entry('sport', at('2026-10-29', '17:00'), at('2026-10-29', '19:00')), // 1h of it before Thu 18:00
      // last week, after the comparable point — ignored
      entry('work', at('2026-10-31', '09:00'), at('2026-10-31', '18:00')),
    ];
    const b = balance(entries, categories, '2026-11-05', now);
    expect(b.week.map((r) => [r.name, r.deltaMs])).toEqual([
      ['Работа', H + 20 * MIN],
      ['Учёба', -40 * MIN],
      ['Спорт', -H],
    ]);
    expect(b.hasPreviousWeek).toBe(true);
  });

  it('прошлой недели нет: изменение не показывается', () => {
    const entries = [entry('work', at('2026-11-02', '09:00'), at('2026-11-02', '10:00'))];
    const b = balance(entries, categories, '2026-11-05', now);
    expect(b.hasPreviousWeek).toBe(false);
  });

  it('записей нет: пустые итоги', () => {
    const b = balance([], categories, '2026-11-05', now);
    expect(b).toMatchObject({ day: [], week: [], dayTotal: 0, weekTotal: 0, hasPreviousWeek: false });
  });

  it('неизвестная категория показывается как «Без категории»', () => {
    const b = balance(
      [entry('gone', at('2026-11-05', '09:00'), at('2026-11-05', '10:00'))],
      categories,
      '2026-11-05',
      now,
    );
    expect(b.day[0]).toMatchObject({ name: 'Без категории', color: undefined });
  });
});
