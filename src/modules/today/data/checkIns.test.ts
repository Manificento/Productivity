import { afterEach, describe, expect, it } from 'vitest';
import { loadDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { db, softDelete } from '../../../core/db';
import { naturalId } from '../../../core/ids';
import { saveCheckIn } from './checkIns';

afterEach(async () => {
  await db.checkIns.clear();
});

describe('contract #275: checkIns — the id is the day', () => {
  it('Given saveSleep, checkIns, habitLogs, mealLogs, weightLogs When создаётся запись Then её id — naturalId(...) — checkIns', async () => {
    const id = await saveCheckIn('2026-11-04', { energy: 2, focus: 3 }, 1000);
    expect(id).toBe(naturalId('checkIn', '2026-11-04'));
    expect(await db.checkIns.toArray()).toEqual([
      { id: 'checkIn:2026-11-04', date: '2026-11-04', energy: 2, focus: 3, createdAt: 1000, updatedAt: 1000 },
    ]);
  });

  it('a check-in deleted and saved again for the same day is the same record again', async () => {
    const id = await saveCheckIn('2026-11-04', { energy: 2, focus: 3 }, 1000);
    await softDelete(db.checkIns, id, 1500);
    expect(await saveCheckIn('2026-11-04', { energy: 5, focus: 4 }, 2000)).toBe(id);
    expect(await db.checkIns.toArray()).toEqual([
      { id, date: '2026-11-04', energy: 5, focus: 4, createdAt: 2000, updatedAt: 2000 },
    ]);
  });
});

describe('check-in data', () => {
  it('Given я выбираю энергию 2 When сохраняю Then создаётся CheckIn, цели дня показывают «Низкая энергия: нагрузка −20%»', async () => {
    await saveCheckIn('2026-11-04', { energy: 2, focus: 3 }, 1000);
    const saved = await db.checkIns.where('date').equals('2026-11-04').toArray();
    expect(saved).toEqual([
      { id: expect.any(String), date: '2026-11-04', energy: 2, focus: 3, createdAt: 1000, updatedAt: 1000 },
    ]);
    const t = await loadDailyTargets('2026-11-04');
    expect(t.reasons).toContainEqual(expect.stringMatching(/Низкая энергия.*нагрузка −20%/));
  });

  it('Given чек-ин уже есть When я меняю оценку Then обновляется та же запись (одна на день)', async () => {
    const id = await saveCheckIn('2026-11-04', { energy: 2, focus: 3, note: 'устал' }, 1000);
    const sameId = await saveCheckIn('2026-11-04', { energy: 4, focus: 3 }, 2000);
    expect(sameId).toBe(id);
    const all = await db.checkIns.toArray();
    expect(all).toEqual([{ id, date: '2026-11-04', energy: 4, focus: 3, createdAt: 1000, updatedAt: 2000 }]);
  });

  it('keeps check-ins of different days apart', async () => {
    await saveCheckIn('2026-11-03', { energy: 3, focus: 3 }, 1000);
    await saveCheckIn('2026-11-04', { energy: 5, focus: 5 }, 2000);
    expect(await db.checkIns.count()).toBe(2);
  });
});
