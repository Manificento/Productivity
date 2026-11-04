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
