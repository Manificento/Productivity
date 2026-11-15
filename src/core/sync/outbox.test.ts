import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, LifeDB, TABLE_NAMES } from '../db';
import type { SyncOutboxEntry, Task } from '../types';
import { LOCAL_ONLY_SETTING_KEYS } from './localOnly';

const T0 = new Date(2026, 10, 4, 12, 0).getTime();

function task(id: string, extra: Partial<Task> = {}): Task {
  return { id, createdAt: T0, updatedAt: T0, title: id, priority: 4, tags: [], ...extra };
}

/** The outbox as `table/key → updatedAt`. */
async function outbox(): Promise<Record<string, number>> {
  const entries: SyncOutboxEntry[] = await db.syncOutbox.toArray();
  return Object.fromEntries(entries.map((e) => [`${e.table}/${e.key}`, e.updatedAt]));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
  await db.syncOutbox.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('contract #274: syncOutbox', () => {
  it('Given любая readwrite-транзакция модуля When она меняет строки Then DBCore-middleware ядра пишет {table, key, updatedAt} в новую таблицу syncOutbox в той же транзакции', async () => {
    // A module transaction lists only the module's own tables — `syncOutbox` is not among them.
    await db.transaction('rw', db.tasks, db.projects, async () => {
      await db.projects.add({ id: 'p1', createdAt: T0, updatedAt: T0, name: 'Дом', archived: false });
      await db.tasks.add(task('t1', { projectId: 'p1' }));
    });

    expect(await db.syncOutbox.toArray()).toEqual([
      { table: 'projects', key: 'p1', updatedAt: T0 },
      { table: 'tasks', key: 't1', updatedAt: T0 },
    ]);
  });

  it('транзакция модуля откатилась → нет ни строки, ни записи в syncOutbox (одна транзакция)', async () => {
    await expect(
      db.transaction('rw', db.tasks, async () => {
        await db.tasks.add(task('t1'));
        throw new Error('модуль передумал');
      }),
    ).rejects.toThrow('модуль передумал');

    expect(await db.tasks.count()).toBe(0);
    expect(await outbox()).toEqual({});
  });

  it('запись вне явной транзакции (db.table.add/put/update/delete) тоже попадает в syncOutbox', async () => {
    await db.tasks.add(task('t1'));
    vi.setSystemTime(T0 + 1000);
    await db.tasks.put(task('t2'));
    vi.setSystemTime(T0 + 2000);
    await db.tasks.update('t1', { title: 'новое название' });
    expect(await outbox()).toEqual({ 'tasks/t1': T0 + 2000, 'tasks/t2': T0 + 1000 });

    vi.setSystemTime(T0 + 3000);
    await db.tasks.delete('t2');
    // One entry per row: the latest change replaces the earlier one. A row that is gone is a deletion to push.
    expect(await outbox()).toEqual({ 'tasks/t1': T0 + 2000, 'tasks/t2': T0 + 3000 });
  });

  it('массовые операции: bulkAdd, bulkPut, bulkDelete, modify и удаление по условию записывают каждую изменённую строку', async () => {
    await db.tasks.bulkAdd([task('a'), task('b', { priority: 3 }), task('c'), task('d')]);
    await db.syncOutbox.clear();

    vi.setSystemTime(T0 + 1000);
    await db.tasks.bulkPut([task('a', { title: 'A' }), task('e')]);
    expect(await outbox()).toEqual({ 'tasks/a': T0 + 1000, 'tasks/e': T0 + 1000 });

    vi.setSystemTime(T0 + 2000);
    await db.tasks.where('priority').equals(3).modify({ priority: 1 });
    await db.tasks.filter((t) => t.title === 'c').modify((t) => void (t.priority = 2));
    expect(await outbox()).toMatchObject({ 'tasks/b': T0 + 2000, 'tasks/c': T0 + 2000 });
    expect(Object.keys(await outbox())).not.toContain('tasks/d');

    vi.setSystemTime(T0 + 3000);
    await db.tasks.bulkDelete(['a', 'b']);
    await db.tasks.filter((t) => t.id === 'c').delete();
    expect(await outbox()).toEqual({
      'tasks/a': T0 + 3000,
      'tasks/b': T0 + 3000,
      'tasks/c': T0 + 3000,
      'tasks/e': T0 + 1000,
    });
    expect((await db.tasks.toArray()).map((t) => t.id)).toEqual(['d', 'e']);
  });

  it('удаление по диапазону первичного ключа и clear() записывают каждую удалённую строку', async () => {
    await db.tasks.bulkAdd([task('a'), task('b'), task('c'), task('d')]);
    await db.syncOutbox.clear();

    vi.setSystemTime(T0 + 1000);
    await db.tasks.where(':id').between('b', 'c', true, true).delete();
    expect(await outbox()).toEqual({ 'tasks/b': T0 + 1000, 'tasks/c': T0 + 1000 });

    vi.setSystemTime(T0 + 2000);
    await db.tasks.clear();
    expect(await outbox()).toEqual({
      'tasks/a': T0 + 2000,
      'tasks/b': T0 + 1000,
      'tasks/c': T0 + 1000,
      'tasks/d': T0 + 2000,
    });
    expect(await db.tasks.count()).toBe(0);
  });

  it('неудавшаяся запись (нарушение уникального ключа) в syncOutbox не попадает', async () => {
    await db.tasks.add(task('t1'));
    await db.syncOutbox.clear();

    await expect(db.tasks.add(task('t1'))).rejects.toThrow();
    await expect(db.tasks.bulkAdd([task('t1'), task('t2')])).rejects.toThrow();

    // bulkAdd outside a transaction keeps the rows that succeeded — and only they are recorded.
    expect(await outbox()).toEqual({ 'tasks/t2': T0 });
  });

  it('чтение ничего не пишет в syncOutbox, а сама таблица syncOutbox в себя не записывается', async () => {
    await db.tasks.add(task('t1'));
    await db.tasks.toArray();
    await db.tasks.get('t1');
    await db.tasks.where('priority').equals(4).count();
    expect(await outbox()).toEqual({ 'tasks/t1': T0 });

    await db.syncOutbox.delete(['tasks', 't1']);
    expect(await outbox()).toEqual({});
  });

  it('Given список ключей состояния устройства (adaptation.morning, adaptation.onboardingDone, device.id, time.pomodoro.running) When читаю src/core/sync/localOnly.ts Then они перечислены и не попадают в syncOutbox', async () => {
    for (const key of LOCAL_ONLY_SETTING_KEYS) await db.settings.put({ key, value: 1 });
    await db.settings.put({ key: 'adaptation.baseline', value: { sleepHours: 8 } });
    await db.settings.bulkPut([
      { key: 'time.pomodoro', value: { workMin: 50 } },
      { key: 'time.pomodoro.running', value: { phase: 'work' } },
    ]);
    expect(await outbox()).toEqual({ 'settings/adaptation.baseline': T0, 'settings/time.pomodoro': T0 });

    // Removing device state — one key, or the whole table — is not recorded either.
    vi.setSystemTime(T0 + 1000);
    await db.settings.delete('time.pomodoro.running');
    await db.settings.clear();
    expect(await outbox()).toEqual({ 'settings/adaptation.baseline': T0 + 1000, 'settings/time.pomodoro': T0 + 1000 });
  });

  it('middleware не меняет сами строки: запись хранится такой, какой её записал модуль, время изменения — в syncOutbox', async () => {
    await db.settings.put({ key: 'theme', value: 'dark' });
    await db.tasks.add(task('t1', { updatedAt: 5 }));

    expect(await db.settings.get('theme')).toEqual({ key: 'theme', value: 'dark' });
    expect(await db.tasks.get('t1')).toEqual(task('t1', { updatedAt: 5 }));
    // A settings row has no write time of its own yet; the entry carries it.
    expect(await outbox()).toEqual({ 'settings/theme': T0, 'tasks/t1': T0 });
  });

  it('Given база версии 6 с данными When она открывается новой версией Then таблица syncOutbox создана пустой и новые изменения в неё записываются', async () => {
    const name = `outbox-v6-${Math.random()}`;
    const v6 = new Dexie(name);
    v6.version(1).stores({ tasks: 'id, projectId, dueDate, priority, completedAt, *tags' });
    v6.version(6).stores({ sleepLogs: 'id, &date, [sourceId+externalId]' });
    await v6.table('tasks').add(task('old'));
    v6.close();

    const upgraded = new LifeDB(name);
    expect(await upgraded.syncOutbox.toArray()).toEqual([]);
    await upgraded.tasks.update('old', { title: 'после обновления' });
    expect(await upgraded.syncOutbox.toArray()).toEqual([{ table: 'tasks', key: 'old', updatedAt: T0 }]);
    upgraded.close();
  });
});
