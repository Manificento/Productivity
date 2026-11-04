import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { saveSleep } from './sleep';
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

  it('rejects implausibly long sleep', async () => {
    await expect(saveSleep({ bedtime: 0, wakeTime: 17 * 3_600_000, quality: 3 })).rejects.toThrow(/16 часов/);
  });
});
