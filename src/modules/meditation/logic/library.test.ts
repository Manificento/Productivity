import { describe, expect, it } from 'vitest';
import { guideMinutes, KINDS, LIBRARY, sessionsOfKind, stepAt } from './library';

describe('library', () => {
  it('не меньше 3 сессий на каждый вид, у каждой шаги с таймингом в целых минутах', () => {
    for (const k of KINDS) expect(sessionsOfKind(k).length).toBeGreaterThanOrEqual(3);
    for (const g of LIBRARY) {
      expect(Number.isInteger(guideMinutes(g)), g.id).toBe(true);
      expect(g.steps.every((s) => s.seconds > 0 && s.text)).toBe(true);
    }
  });
  it('stepAt выбирает шаг по времени', () => {
    const g = sessionsOfKind('focus')[0]!;
    expect(stepAt(g, 0).index).toBe(0);
    expect(stepAt(g, 31_000).index).toBe(1);
    expect(stepAt(g, 999_999).index).toBe(2);
  });
});
