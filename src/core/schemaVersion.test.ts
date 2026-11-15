import { beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_VERSION, exportAll, importAll } from './backup';
import { db, LifeDB, TABLE_NAMES } from './db';
import * as schemaVersion from './schemaVersion';
import { SCHEMA_VERSION } from './schemaVersion';

beforeEach(async () => {
  await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
});

describe('contract #274: единая версия схемы', () => {
  it('Given src/core/schemaVersion.ts When читаю Then одна константа SCHEMA_VERSION, её используют Dexie-версия и BACKUP_VERSION', async () => {
    expect(Object.keys(schemaVersion)).toEqual(['SCHEMA_VERSION']);
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);

    // The newest Dexie version IS the schema version — both for the declared schema and for an opened database.
    const fresh = new LifeDB(`schema-version-${Math.random()}`);
    expect(fresh.verno).toBe(SCHEMA_VERSION);
    await fresh.open();
    expect(fresh.verno).toBe(SCHEMA_VERSION);
    fresh.close();

    expect(BACKUP_VERSION).toBe(SCHEMA_VERSION);
    expect((await exportAll()).version).toBe(SCHEMA_VERSION);
  });

  it('Given копия той же или более старой версии When importAll Then она принимается; копия новее SCHEMA_VERSION отклоняется', async () => {
    const task = { id: 't1', createdAt: 1, updatedAt: 1, title: 'из старой копии', priority: 4, tags: [] };
    const backup = await exportAll();

    // Version 1 is what every backup made before the contract carries (the old BACKUP_VERSION).
    for (const version of [1, SCHEMA_VERSION - 1, SCHEMA_VERSION]) {
      await importAll({ ...backup, version, tables: { tasks: [{ ...task, title: `версия ${version}` }] } });
      expect((await db.tasks.get('t1'))?.title).toBe(`версия ${version}`);
    }

    await expect(importAll({ ...backup, version: SCHEMA_VERSION + 1, tables: { tasks: [] } })).rejects.toThrow(
      'Резервная копия из более новой версии приложения',
    );
    // A rejected backup changes nothing.
    expect(await db.tasks.count()).toBe(1);
  });
});
