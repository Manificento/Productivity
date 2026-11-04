import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { loadMorning, saveMorningSleep, skipMorningStep } from './morning';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const base = { createdAt: 0, updatedAt: 0 };

afterEach(async () => {
  await Promise.all([db.sleepLogs.clear(), db.checkIns.clear(), db.cognitiveTests.clear(), db.settings.clear()]);
});

describe('morning data', () => {
  it('Given шаг «сон» When я подтверждаю предложенные значения Then сон сохраняется через saveSleep()', async () => {
    const r = await saveMorningSleep({ bedtime: at(3, 23, 30), wakeTime: at(4, 7, 30), quality: 3 });
    expect(r).toEqual({ ok: true });
    expect(await db.sleepLogs.toArray()).toEqual([
      expect.objectContaining({ date: '2026-11-04', bedtime: at(3, 23, 30), wakeTime: at(4, 7, 30), quality: 3 }),
    ]);
  });

  it('returns the validation message of saveSleep instead of throwing', async () => {
    const r = await saveMorningSleep({ bedtime: at(4, 7, 20), wakeTime: at(4, 7, 30), quality: 3 });
    expect(r).toEqual({ ok: false, error: 'Сон короче 15 минут — проверьте время' });
    expect(await db.sleepLogs.count()).toBe(0);
  });

  it('loads what the morning card needs for today', async () => {
    await db.sleepLogs.add({
      id: 's0',
      date: '2026-11-02',
      bedtime: at(1, 23),
      wakeTime: at(2, 7),
      quality: 2,
      ...base,
    });
    await db.checkIns.add({ id: 'c', date: '2026-11-04', energy: 3, focus: 3, ...base });
    await db.cognitiveTests.add({
      id: 't',
      date: '2026-11-04',
      kind: 'pvt',
      startedAt: 0,
      durationMs: 60_000,
      reactionTimesMs: [300],
      lapses: 0,
      falseStarts: 0,
      medianRtMs: 300,
      ...base,
    });
    await skipMorningStep('2026-11-04', 'sleep');
    const m = await loadMorning('2026-11-04');
    expect(m.sleep).toBeUndefined();
    expect(m.lastSleep?.id).toBe('s0');
    expect(m.done).toEqual({ sleep: false, checkIn: true, test: true });
    expect(m.skipped).toEqual(['sleep']);
  });

  it('remembers several skipped steps for the day', async () => {
    await skipMorningStep('2026-11-04', 'sleep');
    await skipMorningStep('2026-11-04', 'test');
    expect((await loadMorning('2026-11-04')).skipped).toEqual(['sleep', 'test']);
    expect((await loadMorning('2026-11-05')).skipped).toEqual([]);
  });
});
