import { describe, expect, it } from 'vitest';
import type { MeditationSession } from '../../../core/types';
import { lastWeek, streak } from './stats';

const s = (date: string, durationMin: number): MeditationSession => ({
  id: date + durationMin,
  createdAt: 0,
  updatedAt: 0,
  date,
  startedAt: 0,
  durationMin,
  kind: 'breathing',
  completed: true,
});

describe('stats', () => {
  const sessions = [
    s('2026-11-03', 5),
    s('2026-11-03', 3),
    s('2026-11-02', 10),
    s('2026-11-01', 5),
    s('2026-10-29', 5),
  ];
  it('минуты по дням за неделю', () => {
    const w = lastWeek(sessions, '2026-11-03');
    expect(w).toHaveLength(7);
    expect(w.at(-1)).toEqual({ date: '2026-11-03', minutes: 8 });
    expect(w.find((d) => d.date === '2026-11-02')?.minutes).toBe(10);
    expect(w.find((d) => d.date === '2026-10-31')?.minutes).toBe(0);
  });
  it('серия дней подряд; сегодня без сессии серию не обрывает', () => {
    expect(streak(sessions, '2026-11-03')).toBe(3);
    expect(streak(sessions, '2026-11-04')).toBe(3);
    expect(streak(sessions, '2026-11-05')).toBe(0);
    expect(streak([], '2026-11-03')).toBe(0);
  });
});
