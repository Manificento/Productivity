import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { loadNbackSessions, saveNbackSession } from './mindSessions';

beforeEach(async () => {
  await db.mindSessions.clear();
});

describe('n-back storage', () => {
  it('Given a finished session When it is saved Then mindSessions has kind nback with level, accuracy and the local day', async () => {
    await saveNbackSession(
      {
        startedAt: new Date(2026, 10, 4, 23, 30).getTime(),
        durationMs: 180_000,
        level: 2,
        accuracyPct: 88,
        meanRtMs: 640,
        errors: 7,
      },
      1_000,
    );
    const [row] = await loadNbackSessions();
    expect(row).toMatchObject({
      kind: 'nback',
      date: '2026-11-04',
      level: 2,
      accuracyPct: 88,
      meanRtMs: 640,
      errors: 7,
      durationMs: 180_000,
    });
  });

  it('only n-back rows are loaded', async () => {
    await db.mindSessions.add({
      id: 'x',
      createdAt: 1,
      updatedAt: 1,
      date: '2026-11-04',
      kind: 'stroop',
      durationMs: 1,
      accuracyPct: 1,
    });
    expect(await loadNbackSessions()).toEqual([]);
  });
});
