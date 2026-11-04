import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { createDefaultCategories, listCategories, startCategoryTimer, stopTimer } from './timeStore';

beforeEach(async () => {
  await Promise.all([db.timeCategories.clear(), db.timeEntries.clear()]);
});

describe('timeStore', () => {
  it('двойной тап по той же категории не дробит запись', async () => {
    const [a, b] = await Promise.all([
      startCategoryTimer({ categoryId: 'c1', source: 'timer' }, 1000),
      startCategoryTimer({ categoryId: 'c1', source: 'timer' }, 1005),
    ]);
    expect(a).toBe(b);
    const entries = await db.timeEntries.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ start: 1000 });
    expect(entries[0]?.end).toBeUndefined();
  });

  it('старт другой категории завершает идущую в тот же момент и обновляет updatedAt', async () => {
    const first = await startCategoryTimer({ categoryId: 'c1', source: 'timer' }, 1000);
    await startCategoryTimer({ categoryId: 'c2', source: 'timer' }, 5000);
    expect(await db.timeEntries.get(first)).toMatchObject({ end: 5000, updatedAt: 5000 });
  });

  it('стоп уже остановленного таймера ничего не меняет', async () => {
    const id = await startCategoryTimer({ categoryId: 'c1', source: 'timer' }, 1000);
    await stopTimer(id, 2000);
    await stopTimer(id, 9000);
    await stopTimer('missing', 9000);
    expect((await db.timeEntries.get(id))?.end).toBe(2000);
  });

  it('стартовый набор создаётся один раз, даже если все прежние категории в архиве', async () => {
    await createDefaultCategories(1);
    await createDefaultCategories(2);
    expect(await db.timeCategories.count()).toBe(5);

    await db.timeCategories.toCollection().modify({ archived: true });
    expect(await listCategories()).toEqual([]);
    await createDefaultCategories(3);
    expect((await listCategories()).map((c) => c.name)).toEqual(['Учёба', 'Работа', 'Спорт', 'Отдых', 'Быт']);
  });
});
