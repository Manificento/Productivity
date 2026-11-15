import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportAll, importAll } from './backup';
import { db, getDeviceId, LifeDB, softDelete, TABLE_NAMES } from './db';
import { SCHEMA_VERSION } from './schemaVersion';
import type { Setting } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(async () => {
  await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
  await db.syncOutbox.clear();
});

describe('contract #274: deviceId', () => {
  it('Given устройство When приложение открывается впервые Then в settings device.id создаётся UUID, он не синхронизируется и не попадает в экспорт', async () => {
    const name = `device-${Math.random()}`;
    const first = new LifeDB(name);
    // No explicit call: the id exists as soon as the database is open, before the first query of the app.
    const created = await first.settings.get('device.id');
    expect(created?.value).toMatch(UUID);
    // Not synced: creating it queued nothing.
    expect(await first.syncOutbox.count()).toBe(0);
    first.close();

    // The next start keeps the id — it identifies the installation.
    const second = new LifeDB(name);
    expect((await second.settings.get('device.id'))?.value).toBe(created?.value);
    expect(await second.settings.where('key').startsWith('device.').count()).toBe(1);
    second.close();

    // Not exported: a backup restored on another phone must not carry this phone's identity.
    const id = await getDeviceId();
    expect(id).toMatch(UUID);
    await db.settings.put({ key: 'theme', value: 'dark' });
    const backup = await exportAll();
    expect(backup.tables.settings).toEqual([{ key: 'theme', value: 'dark' }]);
    expect(JSON.stringify(backup)).not.toContain(id);
    expect(await db.syncOutbox.get(['settings', 'device.id'])).toBeUndefined();
  });

  it('Given база прежней версии с данными When приложение обновилось и открывается Then device.id создаётся, данные на месте', async () => {
    const name = `device-v6-${Math.random()}`;
    const v6 = new Dexie(name);
    v6.version(1).stores({ settings: 'key', tasks: 'id, projectId, dueDate, priority, completedAt, *tags' });
    v6.version(6).stores({ sleepLogs: 'id, &date, [sourceId+externalId]' });
    await v6.table('settings').add({ key: 'theme', value: 'dark' });
    v6.close();

    const upgraded = new LifeDB(name);
    expect((await upgraded.settings.get('device.id'))?.value).toMatch(UUID);
    expect(await upgraded.settings.get('theme')).toEqual({ key: 'theme', value: 'dark' });
    upgraded.close();
  });

  it('getDeviceId возвращает один и тот же id и создаёт его заново, если ключа нет (очистка настроек)', async () => {
    const id = await getDeviceId();
    expect(await getDeviceId()).toBe(id);
    expect((await db.settings.get('device.id'))?.value).toBe(id);

    await db.settings.clear();
    const fresh = await getDeviceId();
    expect(fresh).toMatch(UUID);
    expect(fresh).not.toBe(id);
    expect(await Promise.all([getDeviceId(), getDeviceId()])).toEqual([fresh, fresh]);
    // softDelete never leaves the device without an id either: device state is removed and created again.
    await softDelete(db.settings, 'device.id');
    expect(await getDeviceId()).toMatch(UUID);
  });
});

describe('contract #274: резервная копия и синхронизация', () => {
  it('экспорт не содержит удалённых записей (tombstone), очереди syncOutbox и device.id', async () => {
    await getDeviceId();
    await db.tasks.bulkAdd([
      { id: 't1', createdAt: 1, updatedAt: 1, title: 'остаётся', priority: 4, tags: [] },
      { id: 't2', createdAt: 1, updatedAt: 1, title: 'удалена', priority: 4, tags: [] },
    ]);
    await db.settings.bulkPut([
      { key: 'adaptation.baseline', value: { sleepHours: 8 } },
      { key: 'health.alarm.dismissal', value: { dismissedAt: 1 } },
      // Device state other than the id IS part of a backup: a restore on the same phone does not repeat onboarding.
      { key: 'adaptation.onboardingDone', value: true },
    ]);
    await softDelete(db.tasks, 't2');
    await softDelete(db.settings, 'health.alarm.dismissal');

    const backup = JSON.parse(JSON.stringify(await exportAll()));
    expect(backup.version).toBe(SCHEMA_VERSION);
    expect(Object.keys(backup.tables).sort()).toEqual([...TABLE_NAMES].sort());
    expect(backup.tables).not.toHaveProperty('syncOutbox');
    expect(backup.tables.tasks.map((t: { id: string }) => t.id)).toEqual(['t1']);
    expect(backup.tables.settings.map((s: Setting) => s.key).sort()).toEqual([
      'adaptation.baseline',
      'adaptation.onboardingDone',
    ]);
    expect(JSON.stringify(backup)).not.toContain('deletedAt');
  });

  it('импорт сохраняет device.id этого устройства: чужой id из копии не принимается, старая копия без id импортируется', async () => {
    const mine = await getDeviceId();
    const task = { id: 't1', createdAt: 1, updatedAt: 1, title: 'из копии', priority: 4, tags: [] };

    // A backup made before the contract: version 1, no device.id, no sync fields.
    await importAll({
      format: 'lifeos-backup',
      version: 1,
      exportedAt: 1,
      tables: { tasks: [task], settings: [{ key: 'theme', value: 'dark' }] },
    });
    expect(await db.tasks.toArray()).toEqual([task]);
    expect(await db.settings.get('theme')).toEqual({ key: 'theme', value: 'dark' });
    expect(await getDeviceId()).toBe(mine);

    // A hand-made or foreign file that does carry an id: it is ignored.
    await importAll({
      format: 'lifeos-backup',
      version: SCHEMA_VERSION,
      exportedAt: 2,
      tables: {
        settings: [
          { key: 'device.id', value: 'чужое-устройство' },
          { key: 'theme', value: 'light' },
        ],
      },
    });
    expect(await getDeviceId()).toBe(mine);
    expect(await db.settings.toArray()).toEqual([
      { key: 'device.id', value: mine },
      { key: 'theme', value: 'light' },
    ]);
    expect(await db.tasks.count()).toBe(0);
  });

  it('строки с deletedAt в файле копии не импортируются: копия — только живые данные', async () => {
    const night = { id: 's1', createdAt: 1, updatedAt: 1, date: '2026-11-04', bedtime: 1, wakeTime: 2, quality: 4 };
    await importAll({
      format: 'lifeos-backup',
      version: SCHEMA_VERSION,
      exportedAt: 1,
      // Not something exportAll writes; a deleted night on the same day must not make the import fail on &date.
      tables: { sleepLogs: [{ ...night, id: 's0', deletedAt: 5 }, night] },
    });
    expect(await db.sleepLogs.toArray()).toEqual([night]);
  });

  it('импорт заменяет и удалённые записи: tombstone не мешает строке из копии с тем же id или уникальным ключом', async () => {
    const night = { id: 's1', createdAt: 1, updatedAt: 1, date: '2026-11-04', bedtime: 1, wakeTime: 2, quality: 4 };
    await db.sleepLogs.add(night);
    const backup = await exportAll();
    await softDelete(db.sleepLogs, 's1');
    await db.sleepLogs.add({ ...night, id: 's2' });
    await softDelete(db.sleepLogs, 's2');

    await importAll(backup);
    expect(await db.sleepLogs.toArray()).toEqual([night]);
    // Everything the import removed or wrote is queued: with an account, a restore replaces the cloud copy.
    const queued = (await db.syncOutbox.toArray()).filter((e) => e.table === 'sleepLogs').map((e) => e.key);
    expect(queued.sort()).toEqual(['s1', 's2']);
  });
});
