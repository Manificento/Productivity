import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { deleteSleep, saveSleep } from './sleep';
import { sleepHours, sleepWindow } from './sleepTime';

beforeEach(async () => {
  await db.sleepLogs.clear();
});

describe('sleepWindow', () => {
  it('bedtime later on the clock than wake time means the previous evening', () => {
    const w = sleepWindow('2026-11-05', '23:30', '07:00');
    expect(new Date(w.bedtime).getDate()).toBe(4);
    expect(sleepHours(w)).toBe(7.5);
  });

  it('bedtime after midnight stays on the wake-up day', () => {
    const w = sleepWindow('2026-11-05', '01:15', '08:15');
    expect(new Date(w.bedtime).getDate()).toBe(5);
    expect(sleepHours(w)).toBe(7);
  });
});

describe('sleepWindow input validation', () => {
  it('rejects malformed clock times with a readable message', () => {
    expect(() => sleepWindow('2026-11-05', '7', '07:00')).toThrow(/ЧЧ:ММ/);
  });

  it('equal bedtime and wake time is zero sleep, not 24 hours', () => {
    expect(sleepHours(sleepWindow('2026-11-05', '07:00', '07:00'))).toBe(0);
  });
});

describe('saveSleep', () => {
  it('creates one record dated by the wake-up day', async () => {
    const saved = await saveSleep({ ...sleepWindow('2026-11-05', '23:30', '07:00'), quality: 4 });
    expect(saved.date).toBe('2026-11-05');
    expect(await db.sleepLogs.count()).toBe(1);
  });

  it('updates the existing record for the same night instead of adding a second one', async () => {
    const first = await saveSleep({ ...sleepWindow('2026-11-05', '23:30', '07:00'), quality: 4 }, 1);
    const second = await saveSleep({ ...sleepWindow('2026-11-05', '00:30', '07:00'), quality: 2 }, 2);
    expect(await db.sleepLogs.count()).toBe(1);
    expect(second.id).toBe(first.id);
    expect(second.quality).toBe(2);
    expect(second.updatedAt).toBe(2);
  });

  it('rejects quality outside 1–5', async () => {
    await expect(saveSleep({ ...sleepWindow('2026-11-05', '23:30', '07:00'), quality: 6 })).rejects.toThrow();
  });

  it('rejects wake time before bedtime', async () => {
    await expect(saveSleep({ bedtime: 2_000, wakeTime: 1_000, quality: 3 })).rejects.toThrow(/позже отбоя/);
  });

  it('rejects sleep shorter than 15 minutes', async () => {
    await expect(saveSleep({ ...sleepWindow('2026-11-05', '07:00', '07:00'), quality: 3 })).rejects.toThrow(/15 минут/);
  });

  it('dates the record by the LOCAL wake-up day, not UTC', async () => {
    // 02:00 in Almaty (UTC+5) is still the previous day in UTC.
    const saved = await saveSleep({ ...sleepWindow('2026-11-05', '22:00', '02:00'), quality: 3 });
    expect(saved.date).toBe('2026-11-05');
  });

  it('rejects implausibly long sleep', async () => {
    await expect(saveSleep({ bedtime: 0, wakeTime: 17 * 3_600_000, quality: 3 })).rejects.toThrow(/16 часов/);
  });

  it('moving a night to another day: delete the old record, then save the new one', async () => {
    const old = await saveSleep({ ...sleepWindow('2026-11-05', '23:30', '07:00'), quality: 4 });
    await deleteSleep(old.id);
    await saveSleep({ ...sleepWindow('2026-11-06', '23:30', '07:00'), quality: 4 });
    expect((await db.sleepLogs.toArray()).map((s) => s.date)).toEqual(['2026-11-06']);
  });
});

describe('saveSleep — imported nights (#227)', () => {
  const SC = 'com.northcube.sleepcycle';
  const night = (wakeDay: string, bed = '23:30', wake = '07:00') => sleepWindow(wakeDay, bed, wake);

  it('Given ночь сохранена через импорт (saveSleep из Sleep Cycle / Health) When читаю SleepLog Then у записи есть sourceId (и externalId), у записи вручную их нет', async () => {
    const imported = await saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 1_000);
    const manual = await saveSleep({ ...night('2026-11-06'), quality: 4 }, 1_000);
    expect(await db.sleepLogs.get(imported.id)).toMatchObject({ date: '2026-11-05', sourceId: SC, externalId: 'sc-1' });
    const stored = await db.sleepLogs.get(manual.id);
    expect(stored?.sourceId).toBeUndefined();
    expect(stored?.externalId).toBeUndefined();
  });

  it('Given повторный импорт той же ночи When запись обновляется Then дубль не создаётся ([sourceId+externalId])', async () => {
    const first = await saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 1_000);
    // The app corrected the night: the import owns bedtime and wake time; quality entered in LifeOS stays.
    await db.sleepLogs.update(first.id, { quality: 5 });
    const again = await saveSleep(
      { ...night('2026-11-05', '23:45', '07:10'), quality: 3, sourceId: SC, externalId: 'sc-1' },
      2_000,
    );
    expect(await db.sleepLogs.count()).toBe(1);
    expect(again).toMatchObject({
      id: first.id,
      ...night('2026-11-05', '23:45', '07:10'),
      quality: 5,
      updatedAt: 2_000,
    });
    expect(await db.sleepLogs.get(first.id)).toEqual(again);
  });

  it('a re-import without changes writes nothing', async () => {
    const first = await saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 1_000);
    expect(await saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 2_000)).toEqual(
      first,
    );
    expect((await db.sleepLogs.get(first.id))?.updatedAt).toBe(1_000);
  });

  it('a re-imported night that now ends on another day moves there', async () => {
    const first = await saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 1_000);
    const moved = await saveSleep({ ...night('2026-11-06'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 2_000);
    expect(moved.id).toBe(first.id);
    expect(moved.date).toBe('2026-11-06');
    expect(await db.sleepLogs.count()).toBe(1);
  });

  it('an import never overwrites a night already logged for that day (manual or from another app)', async () => {
    const manual = await saveSleep({ ...night('2026-11-05'), quality: 4 }, 1_000);
    const result = await saveSleep(
      { ...night('2026-11-05', '22:00', '06:00'), quality: 3, sourceId: SC, externalId: 'sc-1' },
      2_000,
    );
    expect(result).toEqual(manual);
    expect(await db.sleepLogs.toArray()).toEqual([manual]);

    const fromHealth = await saveSleep(
      { ...night('2026-11-06'), quality: 3, sourceId: 'com.google.android.apps.fitness', externalId: 'hc-9' },
      1_000,
    );
    expect(
      await saveSleep({ ...night('2026-11-06', '22:00', '06:00'), quality: 3, sourceId: SC, externalId: 'sc-2' }),
    ).toEqual(fromHealth);
  });

  it('a re-imported night moving onto a day that already has another night leaves that night alone', async () => {
    const other = await saveSleep({ ...night('2026-11-06'), quality: 4 }, 1_000);
    const first = await saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 1_000);
    const result = await saveSleep({ ...night('2026-11-06'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 2_000);
    expect(result).toEqual(other);
    // The imported copy is gone: the night now belongs to a day that already has one.
    expect(await db.sleepLogs.get(first.id)).toBeUndefined();
    expect(await db.sleepLogs.count()).toBe(1);
  });

  it('editing an imported night by hand keeps it marked as imported (it was not lived in the app)', async () => {
    const imported = await saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: 'sc-1' }, 1_000);
    const edited = await saveSleep({ ...night('2026-11-05', '23:00', '07:00'), quality: 5 }, 2_000);
    expect(edited).toMatchObject({ id: imported.id, quality: 5, sourceId: SC, externalId: 'sc-1' });
  });

  it('sourceId and externalId come together and are not empty', async () => {
    await expect(saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC })).rejects.toThrow(/источник/i);
    await expect(saveSleep({ ...night('2026-11-05'), quality: 3, externalId: 'sc-1' })).rejects.toThrow(/источник/i);
    await expect(saveSleep({ ...night('2026-11-05'), quality: 3, sourceId: SC, externalId: ' ' })).rejects.toThrow();
    expect(await db.sleepLogs.count()).toBe(0);
  });
});
