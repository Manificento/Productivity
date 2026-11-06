import { describe, expect, it } from 'vitest';
import { atLocalTime } from '../../../core/logging/sleepTime';
import type { Habit, HabitLog, HabitSchedule } from '../../../core/types';
import { calendarGrid, cellStatusLabel, habitHistory, habitStats, textOn } from './calendar';

const TODAY = '2026-11-05'; // Thursday; grid weeks start Mon 10/05 … Mon 11/02

const log = (date: string, habitId = 'h', done = true): HabitLog => ({
  id: `${habitId}-${date}`,
  habitId,
  date,
  done,
  createdAt: 0,
  updatedAt: 0,
});

const history = (schedule: HabitSchedule, dates: string[], since = '2026-09-01') => ({
  schedule,
  logs: dates.map((d) => log(d)),
  since,
});

describe('calendarGrid', () => {
  it('история за 5 недель: сетка пн–вс × 5 недель — выполнено / пропущено / не запланировано', () => {
    const grid = calendarGrid(
      history({ kind: 'weekdays', weekdays: [1, 3, 5] }, ['2026-10-05', '2026-10-07', '2026-11-02']),
      TODAY,
    );
    expect(grid).toHaveLength(5);
    expect(grid.every((row) => row.length === 7)).toBe(true);
    expect(grid[0]![0]).toEqual({ date: '2026-10-05', status: 'done' }); // Mon
    expect(grid[0]![1]).toEqual({ date: '2026-10-06', status: 'off' }); // Tue — not scheduled
    expect(grid[0]![2]).toEqual({ date: '2026-10-07', status: 'done' }); // Wed
    expect(grid[0]![4]).toEqual({ date: '2026-10-09', status: 'missed' }); // Fri
    expect(grid[4]!.map((c) => c.status)).toEqual(['done', 'off', 'missed', 'off', 'future', 'future', 'future']);
    expect(grid[4]![3]).toEqual({ date: TODAY, status: 'off' }); // Thursday is not scheduled
  });

  it('сегодня не отмечено — ещё можно сделать; дни до создания привычки — не запланированы', () => {
    const grid = calendarGrid(history({ kind: 'daily' }, ['2026-11-04'], '2026-11-03'), TODAY);
    expect(grid[4]!.slice(0, 4).map((c) => c.status)).toEqual(['off', 'missed', 'done', 'open']);
  });

  it('«N раз в неделю»: прошлая неделя без нормы — пропуски, неделя с нормой и текущая — не отмечено', () => {
    const grid = calendarGrid(
      history({ kind: 'timesPerWeek', timesPerWeek: 3 }, [
        '2026-10-26', // week of 10/26: 1 of 3 — missed
        '2026-10-19',
        '2026-10-20',
        '2026-10-21', // week of 10/19: quota met
        '2026-11-02', // current week
      ]),
      TODAY,
    );
    expect(grid[3]!.map((c) => c.status)).toEqual(['done', 'missed', 'missed', 'missed', 'missed', 'missed', 'missed']);
    expect(grid[2]!.slice(3).map((c) => c.status)).toEqual(['open', 'open', 'open', 'open']);
    expect(grid[4]!.slice(0, 4).map((c) => c.status)).toEqual(['done', 'open', 'open', 'open']);
  });

  it('отметка задним числом до дня создания — видна как выполнено', () => {
    const grid = calendarGrid(history({ kind: 'daily' }, ['2026-11-02'], '2026-11-04'), TODAY);
    expect(grid[4]!.slice(0, 3).map((c) => c.status)).toEqual(['done', 'missed', 'missed']);
  });
});

describe('habitStats', () => {
  it('серии и процент за 7 и 30 дней', () => {
    const dates = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];
    const stats = habitStats(history({ kind: 'daily' }, dates, '2026-10-20'), TODAY);
    expect(stats.streak).toEqual({ current: 4, best: 4, unit: 'days' });
    expect(stats.rate7).toBe(57); // 10/29–11/04: 4 of 7
    expect(stats.rate30).toBe(44); // 10/20–11/04: 7 of 16
  });

  it('habitHistory берёт только логи этой привычки и день создания', () => {
    const habit: Habit = {
      id: 'h',
      name: 'Бег',
      schedule: { kind: 'daily' },
      archived: false,
      createdAt: atLocalTime('2026-10-20', '23:30'),
      updatedAt: 0,
    };
    const h = habitHistory(habit, [log('2026-11-01'), log('2026-11-01', 'other')]);
    expect(h.since).toBe('2026-10-20');
    expect(h.logs).toHaveLength(1);
  });

  it('цвет текста на цвете привычки читаем', () => {
    expect(textOn('#6366f1')).toBe('#ffffff');
    expect(textOn('#f59e0b')).toBe('#18181b');
    expect(textOn('#22c55e')).toBe('#18181b');
    expect(textOn('not-a-colour')).toBe('#ffffff');
  });

  it('подписи статусов', () => {
    expect(cellStatusLabel('missed')).toBe('пропущено');
    expect(cellStatusLabel('future')).toBe('впереди');
  });
});

describe('calendarGrid: облегчённые дни', () => {
  it('непомеченный облегчённый день — «не считается», а не «пропущено»', () => {
    const h = { schedule: { kind: 'daily' } as const, logs: [], since: '2026-10-01', relaxed: new Set(['2026-11-02']) };
    const cells = calendarGrid(h, '2026-11-05').flat();
    expect(cells.find((c) => c.date === '2026-11-02')?.status).toBe('relaxed');
    expect(cells.find((c) => c.date === '2026-11-03')?.status).toBe('missed');
  });
});
