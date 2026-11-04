import { describe, expect, it } from 'vitest';
import {
  FALSE_START_MS,
  LAPSE_MS,
  PVT_DURATION_MS,
  finishPvt,
  median,
  parseDurationParam,
  randomDelayMs,
  safeReturnPath,
  startPvt,
  summarizePvt,
  tapPvt,
  tickPvt,
  type PvtRunning,
} from './pvt';

const fixedRandom = (value: number) => () => value;

function running(state: ReturnType<typeof startPvt>): PvtRunning {
  return state;
}

describe('randomDelayMs', () => {
  it('stimulus appears at random intervals of 2–10 s', () => {
    expect(randomDelayMs(fixedRandom(0))).toBe(2_000);
    expect(randomDelayMs(fixedRandom(0.5))).toBe(6_000);
    expect(randomDelayMs(fixedRandom(0.999_999))).toBeLessThanOrEqual(10_000);
    expect(randomDelayMs(fixedRandom(0.999_999))).toBeGreaterThan(9_999);
  });
});

describe('PVT run', () => {
  it('Given I press «Начать» Then the test runs for 60 s and the first stimulus is scheduled 2–10 s later', () => {
    const s = startPvt(1_000, PVT_DURATION_MS, 3_000);
    expect(s.phase).toBe('running');
    expect(s.endsAt).toBe(61_000);
    expect(s.stimulusAt).toBe(4_000);
    expect(s.shownAt).toBeUndefined();
  });

  it('the stimulus is shown once its time has come', () => {
    let s = running(startPvt(0, PVT_DURATION_MS, 2_000));
    s = tickPvt(s, 1_999) as PvtRunning;
    expect(s.shownAt).toBeUndefined();
    s = tickPvt(s, 2_016) as PvtRunning;
    expect(s.shownAt).toBe(2_016);
  });

  it('a tap after the stimulus records the reaction time and schedules the next stimulus', () => {
    let s = running(startPvt(0, PVT_DURATION_MS, 2_000));
    s = tickPvt(s, 2_000) as PvtRunning;
    s = tapPvt(s, 2_250, 5_000);
    expect(s.reactionTimesMs).toEqual([250]);
    expect(s.shownAt).toBeUndefined();
    expect(s.stimulusAt).toBe(7_250);
    expect(s.feedback).toEqual({ kind: 'reaction', ms: 250 });
  });

  it('Given I tapped before the stimulus When the test runs Then it is a false start and the stimulus is rescheduled', () => {
    let s = running(startPvt(0, PVT_DURATION_MS, 2_000));
    s = tapPvt(s, 1_500, 4_000);
    expect(s.falseStarts).toBe(1);
    expect(s.reactionTimesMs).toEqual([]);
    expect(s.stimulusAt).toBe(5_500);
    expect(s.feedback).toEqual({ kind: 'falseStart' });
  });

  it('Given I tapped faster than 100 ms When the test runs Then it is a false start', () => {
    let s = running(startPvt(0, PVT_DURATION_MS, 2_000));
    s = tickPvt(s, 2_000) as PvtRunning;
    s = tapPvt(s, 2_000 + FALSE_START_MS - 1, 3_000);
    expect(s.falseStarts).toBe(1);
    expect(s.reactionTimesMs).toEqual([]);
  });

  it('a tap of exactly 100 ms is a valid reaction', () => {
    let s = running(startPvt(0, PVT_DURATION_MS, 2_000));
    s = tickPvt(s, 2_000) as PvtRunning;
    s = tapPvt(s, 2_000 + FALSE_START_MS, 3_000);
    expect(s.reactionTimesMs).toEqual([100]);
  });

  it('the test finishes when its time is up', () => {
    let s = running(startPvt(0, 5_000, 2_000));
    s = tickPvt(s, 2_000) as PvtRunning;
    s = tapPvt(s, 2_300, 9_000);
    const done = tickPvt(s, 5_000);
    expect(done.phase).toBe('done');
  });

  it('a tap after the time is up is ignored', () => {
    const s = running(startPvt(0, 5_000, 2_000));
    expect(tapPvt(s, 5_000, 2_000)).toBe(s);
  });

  it('a stimulus left unanswered for more than 500 ms when time runs out counts as a lapse without a made-up reaction time', () => {
    let s = running(startPvt(0, 5_000, 2_000));
    s = tickPvt(s, 2_000) as PvtRunning;
    s = tapPvt(s, 2_300, 1_700); // next stimulus at 4 000
    s = tickPvt(s, 4_000) as PvtRunning;
    const done = finishPvt(s, 5_000);
    expect(done.result.reactionTimesMs).toEqual([300]);
    expect(done.result.medianRtMs).toBe(300);
    expect(done.result.lapses).toBe(1);
  });

  it('a stimulus shown just before the end without a chance to react is not counted', () => {
    let s = running(startPvt(0, 5_000, 4_800));
    s = tickPvt(s, 4_800) as PvtRunning;
    const done = finishPvt(s, 5_000);
    expect(done.result.reactionTimesMs).toEqual([]);
    expect(done.result.lapses).toBe(0);
  });
});

describe('summarizePvt', () => {
  it('Given the test ended Then results show the median reaction, lapses (> 500 ms) and false starts', () => {
    const r = summarizePvt([300, 250, LAPSE_MS + 1, 280, LAPSE_MS], 2);
    expect(r.medianRtMs).toBe(300);
    expect(r.lapses).toBe(1);
    expect(r.falseStarts).toBe(2);
    expect(r.reactionTimesMs).toEqual([300, 250, 501, 280, 500]);
  });
});

describe('median', () => {
  it('odd count: the middle value', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('even count: mean of the two middle values, rounded', () => {
    expect(median([200, 301])).toBe(251);
  });

  it('empty list: 0', () => {
    expect(median([])).toBe(0);
  });
});

describe('parseDurationParam', () => {
  it('outside test mode the test always lasts 60 s', () => {
    expect(parseDurationParam('5', false)).toBe(PVT_DURATION_MS);
  });

  it('in test mode ?duration=5 shortens the test to 5 s', () => {
    expect(parseDurationParam('5', true)).toBe(5_000);
  });

  it('in test mode a missing or invalid duration falls back to 60 s', () => {
    expect(parseDurationParam(null, true)).toBe(PVT_DURATION_MS);
    expect(parseDurationParam('abc', true)).toBe(PVT_DURATION_MS);
    expect(parseDurationParam('0', true)).toBe(PVT_DURATION_MS);
    expect(parseDurationParam('61', true)).toBe(PVT_DURATION_MS);
  });
});

describe('safeReturnPath', () => {
  it('accepts an in-app path like /', () => {
    expect(safeReturnPath('/')).toBe('/');
    expect(safeReturnPath('/health')).toBe('/health');
  });

  it('rejects missing values and anything that could leave the app', () => {
    expect(safeReturnPath(null)).toBeUndefined();
    expect(safeReturnPath('https://evil.example')).toBeUndefined();
    expect(safeReturnPath('//evil.example')).toBeUndefined();
    expect(safeReturnPath('/\\evil.example')).toBeUndefined();
  });
});
