import { describe, expect, it } from 'vitest';
import { generateStroopTrial, isCongruent, parseStroopDurationParam, scoreStroop, type StroopAnswer } from './stroop';

describe('Stroop', () => {
  it('trials are a mix of congruent and incongruent, and the answer is the ink colour', () => {
    let s = 5;
    const random = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const trials = Array.from({ length: 400 }, () => generateStroopTrial(random));
    const congruent = trials.filter(isCongruent).length;
    expect(congruent).toBeGreaterThan(80);
    expect(congruent).toBeLessThan(200);
    expect(trials.every((t) => ['red', 'blue', 'green', 'yellow'].includes(t.ink))).toBe(true);
  });

  it('Given 60 s of answers Then accuracy, mean time and the interference effect are pure functions', () => {
    const answers: StroopAnswer[] = [
      { congruent: true, correct: true, rtMs: 500 },
      { congruent: true, correct: true, rtMs: 600 },
      { congruent: false, correct: true, rtMs: 800 },
      { congruent: false, correct: true, rtMs: 900 },
      { congruent: false, correct: false, rtMs: 300 },
    ];
    expect(scoreStroop(answers)).toEqual({
      accuracyPct: 80,
      meanRtMs: 700,
      errors: 1,
      interferenceMs: 300,
      trials: 5,
    });
  });

  it('without correct answers in a group there is no interference and no mean time', () => {
    const score = scoreStroop([{ congruent: true, correct: false, rtMs: 400 }]);
    expect(score).toMatchObject({ accuracyPct: 0, meanRtMs: undefined, interferenceMs: undefined });
    expect(scoreStroop([]).accuracyPct).toBe(0);
  });

  it('duration param works only in test mode within 1–60 s', () => {
    expect(parseStroopDurationParam('8', true)).toBe(8_000);
    expect(parseStroopDurationParam('8', false)).toBe(60_000);
    expect(parseStroopDurationParam('90', true)).toBe(60_000);
  });
});
