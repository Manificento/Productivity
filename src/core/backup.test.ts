import { beforeEach, describe, expect, it } from 'vitest';
import { V7_ROWS } from '../test/fixtures/dbV7';
import { exportAll, importAll } from './backup';
import { db, TABLE_NAMES } from './db';
import { newRecord } from './ids';

beforeEach(async () => {
  await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
});

describe('backup', () => {
  it('export → clear → import restores all data', async () => {
    await db.tasks.add(newRecord({ title: 'Прочитать статью', priority: 2 as const, tags: ['учёба'] }));
    await db.habits.add(newRecord({ name: 'Медитация', schedule: { kind: 'daily' as const }, archived: false }));
    await db.settings.put({ key: 'theme', value: 'dark' });

    const backup = JSON.parse(JSON.stringify(await exportAll()));
    await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
    expect(await db.tasks.count()).toBe(0);

    await importAll(backup);
    expect((await db.tasks.toArray())[0].title).toBe('Прочитать статью');
    expect(await db.habits.count()).toBe(1);
    expect((await db.settings.get('theme'))?.value).toBe('dark');
  });

  it('Given модуль time сохраняет настройки Pomodoro в settings под ключом time.pomodoro When экспорт JSON Then они попадают в копию и восстанавливаются', async () => {
    const pomodoro = { workMin: 50, shortBreakMin: 10, longBreakMin: 20, sessionsBeforeLongBreak: 4 };
    await db.settings.put({ key: 'time.pomodoro', value: pomodoro });

    const backup = JSON.parse(JSON.stringify(await exportAll()));
    expect(backup.tables.settings).toContainEqual({ key: 'time.pomodoro', value: pomodoro });

    await db.settings.clear();
    await importAll(backup);
    expect((await db.settings.get('time.pomodoro'))?.value).toEqual(pomodoro);
  });

  it('rejects files that are not a backup', async () => {
    await expect(importAll({ hello: 'world' })).rejects.toThrow();
  });

  it('rejects backups from a newer app version', async () => {
    const backup = await exportAll();
    await expect(importAll({ ...backup, version: 999 })).rejects.toThrow();
  });
});

describe('backup of the SPEC 0.3 tables (contract C3)', () => {
  it('Given записи в weightLogs, notes и xpEvents When экспорт → очистка → импорт Then они восстановлены', async () => {
    await db.weightLogs.add(newRecord({ date: '2026-11-04', kg: 72.4 }));
    await db.notes.add(newRecord({ title: 'План', body: '# План', linkIds: ['2026-11-04'] }));
    await db.xpEvents.add(newRecord({ date: '2026-11-04', source: 'quest' as const, questId: 'q1', amount: 10 }));

    const backup = JSON.parse(JSON.stringify(await exportAll()));
    expect(backup.tables.weightLogs).toHaveLength(1);
    expect(Object.keys(backup.tables).sort()).toEqual([...TABLE_NAMES].sort());

    await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
    await importAll(backup);
    expect((await db.weightLogs.toArray())[0].kg).toBe(72.4);
    expect((await db.notes.toArray())[0].title).toBe('План');
    expect((await db.xpEvents.toArray())[0].amount).toBe(10);
  });

  it('Given резервная копия со старыми записями When она импортируется Then записи без externalId читаются как раньше', async () => {
    const old = { id: 'w-old', createdAt: 0, updatedAt: 0, date: '2026-10-01', type: 'Бег', durationMin: 30, rpe: 6 };
    const imported = { ...old, id: 'w-new', sourceId: 'com.strava', externalId: 'hk-1' };
    const backup = await exportAll();
    await importAll({ ...backup, tables: { ...backup.tables, workoutLogs: [old, imported] } });
    expect(await db.workoutLogs.get('w-old')).toEqual(old);
    expect(await db.workoutLogs.where('[sourceId+externalId]').equals(['com.strava', 'hk-1']).count()).toBe(1);
  });
});

describe('contract #275: копия, сделанная до детерминированных id', () => {
  const { syncOutbox: _queue, ...tables } = V7_ROWS;
  const oldBackup = (version: number) =>
    JSON.parse(JSON.stringify({ format: 'lifeos-backup', version, exportedAt: 1, tables }));

  it('Given копия со случайными id записей «одна на день» When importAll Then записи встают под naturalId, дубли сливаются как в миграции, элементы приёмов пищи получают id', async () => {
    // 1 — the version of every backup made before #274; 7 — of the ones made between #274 and #275.
    for (const version of [1, 7]) {
      await importAll(oldBackup(version));

      expect((await db.checkIns.toArray()).map((c) => c.id).sort()).toEqual([
        'c-broken',
        'checkIn:2026-11-03',
        'checkIn:2026-11-04',
      ]);
      // The deleted night of the fixture (a tombstone) is not data: it is not imported.
      expect((await db.sleepLogs.toArray()).map((s) => s.id).sort()).toEqual(['sleep:2026-11-03', 'sleep:2026-11-04']);
      expect((await db.weightLogs.toArray()).map((w) => w.id).sort()).toEqual([
        'weight:2026-11-03',
        'weight:2026-11-04',
      ]);
      // Three marks of one habit and day: the one changed last stays.
      expect(await db.habitLogs.get('habitLog:h1:2026-11-03')).toEqual({
        id: 'habitLog:h1:2026-11-03',
        createdAt: 100,
        updatedAt: 300,
        habitId: 'h1',
        date: '2026-11-03',
        done: false,
      });
      expect(await db.habitLogs.count()).toBe(3);
      // Two lunches of one day: one record with the items of both, every item with `id` and `updatedAt`.
      expect((await db.mealLogs.get('meal:2026-11-03:lunch'))?.items).toEqual([
        { id: 'm-1aa0:0', foodId: 'f1', grams: 150, updatedAt: 1500 },
        { id: 'm-1aa0:1', foodId: 'f2', grams: 120, updatedAt: 1500 },
        { id: 'm-2bb1:0', foodId: 'f3', grams: 180, updatedAt: 1700 },
      ]);
      expect(await db.mealLogs.count()).toBe(3);
      // The other tables are imported as they are.
      expect(await db.tasks.toArray()).toEqual(V7_ROWS.tasks);
      expect(await db.plannedSessions.toArray()).toEqual(V7_ROWS.plannedSessions);

      // The restored rows are queued for the sync under the ids they have now.
      const queued = (await db.syncOutbox.toArray()).filter((e) => e.table === 'mealLogs').map((e) => e.key);
      expect(queued.sort()).toEqual(['meal:2026-11-03:dinner', 'meal:2026-11-03:lunch', 'meal:2026-11-04:lunch']);
    }
  });

  it('a backup of the current version is restored as it was exported: natural ids and item ids do not change', async () => {
    await importAll(oldBackup(7));
    const exported = JSON.parse(JSON.stringify(await exportAll()));
    expect(exported.version).toBe(8);

    await importAll(exported);
    expect(JSON.parse(JSON.stringify(await exportAll(exported.exportedAt)))).toEqual(exported);
  });
});
