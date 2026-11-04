import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { sleepHours } from '../../../core/logging/sleepTime';
import { loadRecentSleep, logSleep } from './sleep';

beforeEach(async () => {
  await db.sleepLogs.clear();
});

describe('logSleep', () => {
  it('Given bedtime 23:30 and wake-up 07:00 When I save Then it is 7.5 h dated by the wake-up day, and saving again updates the same record', async () => {
    const first = await logSleep({ wakeDay: '2026-11-04', bedtime: '23:30', wake: '07:00', quality: 4 });
    expect(first.ok && sleepHours(first.log)).toBe(7.5);
    expect(first.ok && first.log.date).toBe('2026-11-04');

    await logSleep({ wakeDay: '2026-11-04', bedtime: '00:30', wake: '07:00', quality: 2 });
    const all = await db.sleepLogs.toArray();
    expect(all).toHaveLength(1);
    expect(sleepHours(all[0])).toBe(6.5);
  });

  it('Given wake-up earlier on the clock than bedtime When I save Then bedtime is the previous evening', async () => {
    const r = await logSleep({ wakeDay: '2026-11-04', bedtime: '23:30', wake: '07:00', quality: 3 });
    expect(r.ok && new Date(r.log.bedtime).getDate()).toBe(3);
  });

  it('invalid input comes back as a readable message', async () => {
    expect(await logSleep({ wakeDay: '2026-11-04', bedtime: '07:00', wake: '07:00', quality: 3 })).toEqual({
      ok: false,
      error: 'Сон короче 15 минут — проверьте время',
    });
    expect(await logSleep({ wakeDay: '2026-11-04', bedtime: '', wake: '07:00', quality: 3 })).toEqual({
      ok: false,
      error: 'Укажите время отбоя и подъёма',
    });
  });

  it('a database failure comes back as a readable message', async () => {
    const put = vi.spyOn(db.sleepLogs, 'add').mockRejectedValueOnce(new Error('quota'));
    const r = await logSleep({ wakeDay: '2026-11-04', bedtime: '23:30', wake: '07:00', quality: 3 });
    expect(r).toEqual({ ok: false, error: 'Не удалось сохранить сон — попробуйте ещё раз' });
    put.mockRestore();
  });
});

describe('loadRecentSleep', () => {
  it('returns only the last 14 days', async () => {
    for (const day of ['2026-10-21', '2026-10-22', '2026-11-04']) {
      await logSleep({ wakeDay: day, bedtime: '23:00', wake: '07:00', quality: 3 });
    }
    expect((await loadRecentSleep('2026-11-04')).map((s) => s.date)).toEqual(['2026-10-22', '2026-11-04']);
  });
});
