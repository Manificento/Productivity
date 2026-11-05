import { describe, expect, it } from 'vitest';
import { cutoffPassed, hasCaffeine, remaining } from './diary';

describe('diary helpers', () => {
  it('detects caffeine by name, ignoring case and ё', () => {
    expect(hasCaffeine('Кофе американо')).toBe(true);
    expect(hasCaffeine('Чай зелёный')).toBe(true);
    expect(hasCaffeine('Овсянка')).toBe(false);
  });
  it('compares the time with the cutoff', () => {
    expect(cutoffPassed('15:00', '15:00')).toBe(true);
    expect(cutoffPassed('14:59', '15:00')).toBe(false);
  });
  it('computes what is left, negative when over', () => {
    expect(remaining(1200, 2000).left).toBe(800);
    expect(remaining(2100.5, 2000).left).toBe(-100.5);
  });
});
