import { beforeEach, describe, expect, it } from 'vitest';
import { db, softDelete } from '../../../core/db';
import { naturalId } from '../../../core/ids';
import { logWeight } from './weight';

beforeEach(async () => {
  await db.weightLogs.clear();
});

describe('contract #275: weightLogs — the id is the day', () => {
  it('Given saveSleep, checkIns, habitLogs, mealLogs, weightLogs When создаётся запись Then её id — naturalId(...) — weightLogs', async () => {
    const created = await logWeight('2026-11-04', 72.4, 1000);
    expect(created).toEqual({
      id: 'weight:2026-11-04',
      date: '2026-11-04',
      kg: 72.4,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(created.id).toBe(naturalId('weight', '2026-11-04'));

    // A second input for the day updates that record.
    const updated = await logWeight('2026-11-04', 72.1, 2000);
    expect(updated).toEqual({ ...created, kg: 72.1, updatedAt: 2000 });
    expect(await db.weightLogs.toArray()).toEqual([updated]);
  });

  it('a weight deleted and entered again for the same day is the same record again', async () => {
    const first = await logWeight('2026-11-04', 72.4, 1000);
    await softDelete(db.weightLogs, first.id, 1500);
    const again = await logWeight('2026-11-04', 71.9, 2000);
    expect(again).toEqual({ id: first.id, date: '2026-11-04', kg: 71.9, createdAt: 2000, updatedAt: 2000 });
    expect(await db.weightLogs.toArray()).toEqual([again]);
  });
});

describe('weight log', () => {
  it('Given ввод 400 When logWeight Then ошибка, записи нет', async () => {
    await expect(logWeight('2026-11-04', 400)).rejects.toThrow(/кг/);
    expect(await db.weightLogs.count()).toBe(0);
  });
});
