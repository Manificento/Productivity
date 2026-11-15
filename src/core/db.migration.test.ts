import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV6Database, createV7Database, storedRowsOf, V7_ROWS, V7_STORES } from '../test/fixtures/dbV7';
import { LifeDB, TABLE_NAMES } from './db';
import { SCHEMA_VERSION } from './schemaVersion';
import { migrateToNaturalIds, NATURAL_KEY_TABLES } from './sync/naturalKeys';
import type { SyncOutboxEntry } from './types';

const T0 = new Date(2026, 10, 15, 9, 0).getTime();
const D3 = '2026-11-03';
const D4 = '2026-11-04';

let name: string;
let db: LifeDB;

/** The v7 fixture, opened by the current app: Dexie runs the upgrade to v8. */
async function upgrade(): Promise<LifeDB> {
  name = `migration-v8-${Math.random()}`;
  await createV7Database(name);
  db = new LifeDB(name);
  await db.open();
  return db;
}

const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  db?.close();
  vi.useRealTimers();
});

describe('contract #275: миграция Dexie v8 на фикстуре базы предыдущей версии (v7)', () => {
  it('Given база с существующими записями со случайными id When приложение обновляется Then миграция Dexie копирует их под новые id; при столкновении нескольких старых записей в один id остаётся запись с наибольшим updatedAt, для mealLogs объединяются items', async () => {
    await upgrade();
    expect(db.verno).toBe(8);
    expect(SCHEMA_VERSION).toBe(8);

    // Every record is under its natural id, with the content it had (createdAt and updatedAt too).
    const [checkIn3, checkIn4, broken] = V7_ROWS.checkIns;
    expect(byId(await db.checkIns.toArray())).toEqual([
      // A row without a valid day has no natural id: it is kept as it is rather than lost.
      broken,
      { ...checkIn3, id: 'checkIn:2026-11-03' },
      { ...checkIn4, id: 'checkIn:2026-11-04' },
    ]);
    const [night3, night4] = V7_ROWS.sleepLogs;
    expect(byId(await db.sleepLogs.toArray())).toEqual([
      { ...night3, id: 'sleep:2026-11-03' },
      { ...night4, id: 'sleep:2026-11-04' },
    ]);
    const [weight3, weight4] = V7_ROWS.weightLogs;
    expect(byId(await db.weightLogs.toArray())).toEqual([
      { ...weight3, id: 'weight:2026-11-03' },
      { ...weight4, id: 'weight:2026-11-04' },
    ]);

    // habitLogs: three old marks of h1 on 3 Nov collapse into one id — the one changed last stays (updatedAt 300).
    expect(byId(await db.habitLogs.toArray())).toEqual([
      { id: 'habitLog:h1:2026-11-03', createdAt: 100, updatedAt: 300, habitId: 'h1', date: D3, done: false },
      { id: 'habitLog:h1:2026-11-04', createdAt: 400, updatedAt: 400, habitId: 'h1', date: D4, done: true },
      { id: 'habitLog:h2:2026-11-03', createdAt: 500, updatedAt: 500, habitId: 'h2', date: D3, done: true },
    ]);

    // mealLogs: two lunch records of 3 Nov collapse into one — the later record stays, the items are united.
    expect(await db.mealLogs.get('meal:2026-11-03:lunch')).toEqual({
      id: 'meal:2026-11-03:lunch',
      createdAt: 1600,
      updatedAt: 1700,
      date: D3,
      time: 1600,
      kind: 'lunch',
      items: [
        { id: 'm-1aa0:0', foodId: 'f1', grams: 150, updatedAt: 1500 },
        { id: 'm-1aa0:1', foodId: 'f2', grams: 120, updatedAt: 1500 },
        { id: 'm-2bb1:0', foodId: 'f3', grams: 180, updatedAt: 1700 },
      ],
    });
    expect((await db.mealLogs.toArray()).map((m) => m.id).sort()).toEqual([
      'meal:2026-11-03:dinner',
      'meal:2026-11-03:lunch',
      'meal:2026-11-04:lunch',
    ]);

    // Nothing is left under a random id — in the store itself, not only in what `db` shows.
    for (const table of NATURAL_KEY_TABLES) {
      const stored = await storedRowsOf<{ id: string }>(name, table);
      expect(stored.map((row) => row.id).filter((id) => id !== 'c-broken' && !/^\w+:/.test(id))).toEqual([]);
    }
  });

  it('Given MealLog.items Then старые элементы без id получают его в миграции (id и updatedAt у каждого элемента)', async () => {
    await upgrade();
    const meals = await db.mealLogs.toArray();
    const items = meals.flatMap((m) => m.items);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.id).toMatch(/^m-\w+:\d+$/);
      expect(typeof item.updatedAt).toBe('number');
    }
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(await db.mealLogs.get('meal:2026-11-03:dinner')).toMatchObject({
      items: [{ id: 'm-3cc2:0', foodId: 'f1', grams: 80, updatedAt: 1800 }],
    });
  });

  it('the indexes find the migrated records: the next write of a day lands on the migrated record', async () => {
    await upgrade();
    expect((await db.sleepLogs.where('date').equals(D3).first())?.id).toBe('sleep:2026-11-03');
    expect(
      (await db.sleepLogs.where('[sourceId+externalId]').equals(['com.northcube.sleepcycle', 'sc-1']).first())?.id,
    ).toBe('sleep:2026-11-04');
    expect((await db.checkIns.where('date').equals(D4).first())?.id).toBe('checkIn:2026-11-04');
    expect((await db.weightLogs.where('date').equals(D4).first())?.id).toBe('weight:2026-11-04');
    expect((await db.habitLogs.where('[habitId+date]').equals(['h1', D3]).toArray()).map((l) => l.id)).toEqual([
      'habitLog:h1:2026-11-03',
    ]);
    expect((await db.mealLogs.where('date').equals(D3).toArray()).map((m) => m.kind).sort()).toEqual([
      'dinner',
      'lunch',
    ]);
  });

  it('the other tables are untouched, and what points at records of other tables still does', async () => {
    await upgrade();
    for (const table of ['tasks', 'habits', 'foods', 'workoutLogs', 'programs', 'plannedSessions', 'notes'] as const) {
      expect(await db.table(table).toArray()).toEqual(V7_ROWS[table]);
    }
    expect((await db.settings.get('device.id'))?.value).toBe('device-1');
    expect((await db.settings.get('theme'))?.value).toBe('dark');
    // No table refers to the ids of the migrated tables; their own references are kept as they were.
    expect((await db.plannedSessions.get('ps-1'))?.workoutLogId).toBe('wo-1');
    expect((await db.habitLogs.toArray()).every((l) => l.habitId === 'h1' || l.habitId === 'h2')).toBe(true);
    const foods = new Set((await db.foods.toArray()).map((f) => f.id));
    expect((await db.mealLogs.toArray()).every((m) => m.items.every((i) => foods.has(i.foodId)))).toBe(true);
    // Every data table is still there (a version without its own stores must not drop anything).
    expect(db.tables.map((t) => t.name).sort()).toEqual([...TABLE_NAMES, 'syncOutbox'].sort());
  });

  it('the outbox is ready for the first cloud copy: every migrated record is queued under its new id, nothing under an old one', async () => {
    await upgrade();
    const entries: SyncOutboxEntry[] = await db.syncOutbox.toArray();
    const queued = (table: string) =>
      entries
        .filter((e) => e.table === table)
        .map((e) => e.key)
        .sort();

    for (const table of NATURAL_KEY_TABLES) {
      const ids = (await db.table<{ id: string }>(table).toArray()).map((row) => row.id).sort();
      expect(queued(table)).toEqual(ids);
    }
    // The old ids were never pushed (there was no push before v8): they are not sent as deletions…
    expect(entries.map((e) => e.key).filter((key) => /^(9d4e|s-dead|m-2bb1|c-41bb)$/.test(key))).toEqual([]);
    // …and the tombstone of a night deleted under a random id is gone with them.
    expect((await storedRowsOf<{ deletedAt?: number }>(name, 'sleepLogs')).filter((s) => s.deletedAt)).toEqual([]);
    // Entries of the other tables stay as they were.
    expect(entries.filter((e) => e.table === 'tasks')).toEqual([{ table: 'tasks', key: 't-1', updatedAt: 2000 }]);
    // The migrated rows are queued at the time of the migration.
    expect(entries.filter((e) => e.table !== 'tasks').every((e) => e.updatedAt === T0)).toBe(true);
    expect(entries).toHaveLength(1 + 3 + 2 + 3 + 3 + 2);
  });

  it('runs once: opening the migrated database again changes nothing', async () => {
    await upgrade();
    const snapshot = async () =>
      Object.fromEntries(
        await Promise.all(
          [...NATURAL_KEY_TABLES, 'syncOutbox'].map(async (t) => [t, await storedRowsOf(name, t)] as const),
        ),
      );
    const before = await snapshot();
    db.close();

    vi.setSystemTime(T0 + 60_000);
    db = new LifeDB(name);
    await db.open();
    expect(await snapshot()).toEqual(before);
  });

  it('an empty database of the previous version upgrades without data and without outbox entries', async () => {
    name = `migration-v8-empty-${Math.random()}`;
    const v7 = new Dexie(name);
    v7.version(7).stores(V7_STORES);
    await v7.open();
    v7.close();

    db = new LifeDB(name);
    await db.open();
    expect(db.verno).toBe(8);
    for (const table of NATURAL_KEY_TABLES) expect(await db.table(table).count()).toBe(0);
    expect(await db.syncOutbox.count()).toBe(0);
  });

  it('a database that skipped v7 (v6: no outbox store yet) is migrated the same way in one upgrade', async () => {
    name = `migration-v6-${Math.random()}`;
    await createV6Database(name);
    db = new LifeDB(name);
    await db.open();
    expect(db.verno).toBe(8);

    expect((await db.sleepLogs.toArray()).map((s) => s.id).sort()).toEqual(['sleep:2026-11-03', 'sleep:2026-11-04']);
    expect((await db.habitLogs.toArray()).map((l) => l.id).sort()).toEqual([
      'habitLog:h1:2026-11-03',
      'habitLog:h1:2026-11-04',
      'habitLog:h2:2026-11-03',
    ]);
    expect((await db.habitLogs.get('habitLog:h1:2026-11-03'))?.updatedAt).toBe(300);
    expect((await db.mealLogs.get('meal:2026-11-03:lunch'))?.items.map((i) => i.id)).toEqual([
      'm-1aa0:0',
      'm-1aa0:1',
      'm-2bb1:0',
    ]);
    expect(await db.tasks.toArray()).toEqual(V7_ROWS.tasks);

    // The queue was created by this very upgrade: it holds the migrated rows and nothing else.
    const entries = await db.syncOutbox.toArray();
    expect(entries.every((e) => (NATURAL_KEY_TABLES as readonly string[]).includes(e.table))).toBe(true);
    expect(entries.map((e) => e.key).filter((key) => key.startsWith('sleep'))).toEqual([
      'sleep:2026-11-03',
      'sleep:2026-11-04',
    ]);
    expect(entries).toHaveLength(3 + 2 + 3 + 3 + 2);
    // The installation of the fixture keeps its id through the upgrade.
    expect((await db.settings.get('device.id'))?.value).toBe('device-1');
  });
});

describe('contract #275: migrateToNaturalIds — the migration itself, outside a Dexie upgrade', () => {
  const tables = [...NATURAL_KEY_TABLES, 'syncOutbox'];
  /** The v7 fixture opened WITHOUT the core middlewares: what the function does on its own. */
  async function migrateRaw(at: number): Promise<Record<string, unknown[]>> {
    const raw = new Dexie(name);
    await raw.open();
    try {
      await raw.transaction('rw', tables, (tx) => migrateToNaturalIds(tx, at));
      return Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await raw.table(t).toArray()] as const)));
    } finally {
      raw.close();
    }
  }

  it('is idempotent: a second run leaves every record as the first run made it', async () => {
    name = `migration-raw-${Math.random()}`;
    await createV7Database(name);

    const { syncOutbox: queue, ...first } = await migrateRaw(T0);
    // Tombstones are dropped by the migration itself — it does not rely on the read middleware to skip them.
    expect(first.sleepLogs.map((s) => (s as { id: string }).id)).toEqual(['sleep:2026-11-03', 'sleep:2026-11-04']);
    expect(first.mealLogs).toHaveLength(3);
    expect(first.habitLogs).toHaveLength(3);

    const { syncOutbox: queueAgain, ...second } = await migrateRaw(T0 + 5_000);
    expect(second).toEqual(first);
    // The queue names the same rows; only the time of the entries of the rewritten tables moved.
    const keys = (entries: unknown[]) => (entries as SyncOutboxEntry[]).map((e) => `${e.table}/${e.key}`);
    expect(keys(queueAgain)).toEqual(keys(queue));
  });
});
