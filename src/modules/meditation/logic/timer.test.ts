import { describe, expect, it } from 'vitest';
import { formatClock, interruptedMinutes, remainingMs } from './timer';

describe('timer', () => {
  it('отсчёт по меткам времени: остаток зависит только от now', () => {
    expect(remainingMs(1000, 3, 1000)).toBe(180_000);
    expect(remainingMs(1000, 3, 1000 + 120_000)).toBe(60_000); // вкладка спала 2 мин
    expect(remainingMs(1000, 3, 1000 + 999_999)).toBe(0);
  });
  it('форматирует часы', () => {
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(0)).toBe('00:00');
  });
  it('прерванная сессия < 1 мин не сохраняется, ≥ 1 мин — целые минуты', () => {
    expect(interruptedMinutes(0, 59_999)).toBeNull();
    expect(interruptedMinutes(0, 60_000)).toBe(1);
    expect(interruptedMinutes(0, 190_000)).toBe(3);
  });
});
