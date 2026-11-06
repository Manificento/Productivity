import { describe, expect, it } from 'vitest';
import {
  START_LEVEL,
  dailyProgress,
  generateSequence,
  isTarget,
  nextLevel,
  parseNbackDurationParam,
  scoreNback,
  trialCountFor,
  type NbackAnswer,
} from './nback';

/** Deterministic pseudo-random source. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const session = (date: string, level: number, accuracyPct: number, createdAt = 0) => ({
  date,
  level,
  accuracyPct,
  createdAt,
});

describe('n-back: sequence', () => {
  it('cells lie in the 3×3 grid and the first n trials can never be targets', () => {
    const seq = generateSequence(60, 2, seeded(1));
    expect(seq).toHaveLength(60);
    expect(seq.every((c) => Number.isInteger(c) && c >= 0 && c < 9)).toBe(true);
    expect(isTarget(seq, 0, 2)).toBe(false);
    expect(isTarget(seq, 1, 2)).toBe(false);
  });

  it('a sequence contains a meaningful share of targets, and the same seed gives the same sequence', () => {
    const seq = generateSequence(120, 2, seeded(7));
    const targets = seq.filter((_, i) => isTarget(seq, i, 2)).length;
    expect(targets).toBeGreaterThanOrEqual(20);
    expect(targets).toBeLessThanOrEqual(60);
    expect(generateSequence(120, 2, seeded(7))).toEqual(seq);
  });

  it('a 3 minute session has 72 trials of 2.5 s', () => {
    expect(trialCountFor(180_000)).toBe(72);
    expect(trialCountFor(5_000)).toBe(2);
  });
});

describe('n-back: scoring (pure functions)', () => {
  // n = 1, sequence 0,0,1,1,2: targets at i=1 and i=3.
  const seq = [0, 0, 1, 1, 2];

  it('accuracy counts hits and correct rejections; mean RT only over hits', () => {
    const answers: NbackAnswer[] = [
      { pressed: false },
      { pressed: true, rtMs: 400 }, // hit
      { pressed: false }, // correct rejection
      { pressed: true, rtMs: 600 }, // hit
      { pressed: false }, // correct rejection
    ];
    expect(scoreNback(seq, 1, answers)).toEqual({ accuracyPct: 100, meanRtMs: 500, errors: 0, trials: 4 });
  });

  it('a miss and a false alarm are errors', () => {
    const answers: NbackAnswer[] = [
      { pressed: false },
      { pressed: false }, // miss
      { pressed: true, rtMs: 300 }, // false alarm
      { pressed: true, rtMs: 700 }, // hit
      { pressed: false },
    ];
    expect(scoreNback(seq, 1, answers)).toEqual({ accuracyPct: 50, meanRtMs: 700, errors: 2, trials: 4 });
  });

  it('with no hits there is no mean reaction time', () => {
    const answers: NbackAnswer[] = seq.map(() => ({ pressed: false }));
    expect(scoreNback(seq, 1, answers).meanRtMs).toBeUndefined();
  });

  it('an unanswered tail counts as not pressed', () => {
    expect(scoreNback(seq, 1, []).accuracyPct).toBe(50);
  });
});

describe('n-back: level adaptation', () => {
  it('Given no history When I start Then n = 2', () => {
    expect(START_LEVEL).toBe(2);
    expect(nextLevel([])).toBe(2);
  });

  it('Given accuracy ≥ 85% two sessions in a row When I start a new one Then n is increased', () => {
    expect(nextLevel([session('2026-11-01', 2, 85, 1), session('2026-11-02', 2, 92, 2)])).toBe(3);
  });

  it('one good session is not enough', () => {
    expect(nextLevel([session('2026-11-01', 2, 70, 1), session('2026-11-02', 2, 95, 2)])).toBe(2);
  });

  it('two good sessions at different levels do not count as a streak', () => {
    expect(nextLevel([session('2026-11-01', 2, 95, 1), session('2026-11-02', 3, 95, 2)])).toBe(3);
  });

  it('Given accuracy ≤ 60% When I start a new session Then n is decreased, but never below 1', () => {
    expect(nextLevel([session('2026-11-02', 3, 60, 2)])).toBe(2);
    expect(nextLevel([session('2026-11-02', 1, 40, 2)])).toBe(1);
  });

  it('accuracy between 60% and 85% keeps the level; the order is by time, not by array position', () => {
    expect(nextLevel([session('2026-11-02', 3, 75, 2), session('2026-11-01', 2, 95, 1)])).toBe(3);
  });
});

describe('n-back: history by day', () => {
  it('level and accuracy per day: highest level, mean accuracy of that day; gaps for empty days', () => {
    const days = dailyProgress(
      [session('2026-11-04', 2, 80), session('2026-11-04', 3, 70), session('2026-11-02', 2, 90)],
      '2026-11-04',
      4,
    );
    expect(days.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
    expect(days[0]).toEqual({ date: '2026-11-01' });
    expect(days[1]).toEqual({ date: '2026-11-02', level: 2, accuracyPct: 90 });
    expect(days[3]).toEqual({ date: '2026-11-04', level: 3, accuracyPct: 75 });
  });
});

describe('n-back: duration param', () => {
  it('is honoured only in test mode and only within 1–180 s', () => {
    expect(parseNbackDurationParam('10', true)).toBe(10_000);
    expect(parseNbackDurationParam('10', false)).toBe(180_000);
    expect(parseNbackDurationParam('0', true)).toBe(180_000);
    expect(parseNbackDurationParam('999', true)).toBe(180_000);
    expect(parseNbackDurationParam(null, true)).toBe(180_000);
  });
});
