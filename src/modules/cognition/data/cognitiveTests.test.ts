import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { loadRecentPvt, savePvtResult } from './cognitiveTests';

const summary = { reactionTimesMs: [250, 300, 520], medianRtMs: 300, lapses: 1, falseStarts: 2 };

beforeEach(async () => {
  await db.cognitiveTests.clear();
});

describe('savePvtResult', () => {
  it('Given the test ended Then a CognitiveTest is saved, dated by the local day', async () => {
    // 2026-11-04 02:00 in Almaty (UTC+5) is still 2026-11-03 in UTC.
    const startedAt = new Date(2026, 10, 4, 2, 0).getTime();
    const saved = await savePvtResult({ startedAt, durationMs: 60_000, result: summary }, startedAt + 60_000);
    const stored = await db.cognitiveTests.get(saved.id);
    expect(stored).toMatchObject({
      kind: 'pvt',
      date: '2026-11-04',
      startedAt,
      durationMs: 60_000,
      reactionTimesMs: [250, 300, 520],
      medianRtMs: 300,
      lapses: 1,
      falseStarts: 2,
      createdAt: startedAt + 60_000,
    });
  });

  it('refuses to save a run without a single valid reaction', async () => {
    const empty = { reactionTimesMs: [], medianRtMs: 0, lapses: 0, falseStarts: 3 };
    await expect(savePvtResult({ startedAt: 0, durationMs: 60_000, result: empty })).rejects.toThrow();
    expect(await db.cognitiveTests.count()).toBe(0);
  });
});

describe('loadRecentPvt', () => {
  it('returns PVT results of the last 14 days only', async () => {
    const at = (d: number) => new Date(2026, 10, d, 9).getTime();
    await savePvtResult({ startedAt: at(4), durationMs: 60_000, result: summary });
    await savePvtResult({ startedAt: new Date(2026, 9, 21, 9).getTime(), durationMs: 60_000, result: summary });
    await savePvtResult({ startedAt: new Date(2026, 9, 22, 9).getTime(), durationMs: 60_000, result: summary });
    const recent = await loadRecentPvt('2026-11-04');
    expect(recent.map((t) => t.date).sort()).toEqual(['2026-10-22', '2026-11-04']);
  });
});
