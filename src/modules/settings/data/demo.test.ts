import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as backup from '../../../core/backup';
import { db, TABLE_NAMES } from '../../../core/db';
import { hasUserData, loadDemoData } from './demo';

const TODAY = '2026-11-04';
const NOW = new Date(2026, 10, 4, 10, 0).getTime();

beforeEach(async () => {
  await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
});

describe('demo data loading', () => {
  it('loads the demo through importAll and replaces existing data', async () => {
    await db.tasks.put({ id: 'mine', createdAt: 0, updatedAt: 0, title: 'Моя задача', priority: 1, tags: [] });
    const importAll = vi.spyOn(backup, 'importAll');
    await loadDemoData(TODAY, NOW);
    expect(importAll).toHaveBeenCalledTimes(1);
    expect(await db.tasks.get('mine')).toBeUndefined();
    expect(await db.sleepLogs.count()).toBe(14);
    expect(await db.lifeEvents.toArray()).toEqual([expect.objectContaining({ title: 'IELTS', date: '2026-11-09' })]);
    importAll.mockRestore();
  });

  it('hasUserData tells whether any table holds records', async () => {
    expect(await hasUserData()).toBe(false);
    await db.settings.put({ key: 'theme', value: 'dark' });
    expect(await hasUserData()).toBe(true);
  });
});
