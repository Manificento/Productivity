import { renderHook, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storedRows as stored } from '../../test/storedRows';
import { db, softDelete, softDeleteMany, TABLE_NAMES } from '../db';
import type { CheckIn, Note, PlannedSession, SleepLog, Task, WeightLog } from '../types';

const T0 = new Date(2026, 10, 4, 12, 0).getTime();
const DAY = '2026-11-04';

function task(id: string, extra: Partial<Task> = {}): Task {
  return { id, createdAt: T0, updatedAt: T0, title: id, priority: 4, tags: [], ...extra };
}

async function outboxKeys(table: string): Promise<string[]> {
  return (await db.syncOutbox.where('[table+key]').between([table, Dexie.minKey], [table, Dexie.maxKey]).toArray())
    .map((e) => e.key)
    .sort();
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
  await db.syncOutbox.clear();
  // a, c, e stay; b and d become tombstones.
  await db.tasks.bulkAdd([
    task('a', { dueDate: '2026-11-01', priority: 1, tags: ['дом'] }),
    task('b', { dueDate: '2026-11-02', priority: 1, tags: ['дом'] }),
    task('c', { dueDate: '2026-11-03', priority: 2, tags: ['дом', 'учёба'] }),
    task('d', { dueDate: '2026-11-03', priority: 2, tags: ['учёба'] }),
    task('e', { dueDate: '2026-11-05', priority: 3, tags: [] }),
  ]);
  vi.setSystemTime(T0 + 1000);
  await softDelete(db.tasks, 'b');
  await softDelete(db.tasks, 'd');
});

afterEach(() => {
  vi.useRealTimers();
});

const ids = (tasks: Task[]): string[] => tasks.map((t) => t.id);

describe('contract #274: softDelete и read-middleware', () => {
  it('Given любой модуль удаляет запись через новый хелпер softDelete(table, id) из src/core/db.ts When читаю таблицу через db Then запись помечена deletedAt', async () => {
    const rows = await stored<Task>('tasks');
    // The row is still in IndexedDB with the mark and a bumped updatedAt (the deletion wins last-writer-wins)…
    expect(rows).toHaveLength(5);
    expect(rows.find((t) => t.id === 'b')).toMatchObject({ id: 'b', deletedAt: T0 + 1000, updatedAt: T0 + 1000 });
    expect(rows.find((t) => t.id === 'a')).not.toHaveProperty('deletedAt');
    // …and the deletion is queued for the sync.
    expect(await db.syncOutbox.get(['tasks', 'b'])).toEqual({ table: 'tasks', key: 'b', updatedAt: T0 + 1000 });
  });

  it('удалённая запись не хранит содержимое: от неё остаются только ключ, createdAt, updatedAt и deletedAt', async () => {
    // What the user deleted must not stay on the device, nor reach the cloud with the first push (ADR-0010 p. 1).
    expect((await stored<Task>('tasks')).find((t) => t.id === 'b')).toEqual({
      id: 'b',
      createdAt: T0,
      updatedAt: T0 + 1000,
      deletedAt: T0 + 1000,
    });
  });

  it('текста удалённой заметки нет в IndexedDB', async () => {
    const note: Note = {
      id: 'n1',
      createdAt: T0,
      updatedAt: T0,
      title: 'Личное',
      body: 'секретный текст',
      linkIds: ['a'],
    };
    await db.notes.add(note);
    await softDelete(db.notes, 'n1');

    const rows = await stored('notes');
    expect(rows).toEqual([{ id: 'n1', createdAt: T0, updatedAt: T0 + 1000, deletedAt: T0 + 1000 }]);
    expect(JSON.stringify(rows)).not.toContain('секретный текст');
    expect(JSON.stringify(rows)).not.toContain('Личное');
    // The tombstone left the indexes of the removed fields too.
    expect(await db.notes.where('linkIds').equals('a').count()).toBe(0);
  });

  it('read-middleware скрывает удалённую запись из get', async () => {
    expect(await db.tasks.get('b')).toBeUndefined();
    expect(await db.tasks.get({ dueDate: '2026-11-02' })).toBeUndefined();
    expect((await db.tasks.get('a'))?.id).toBe('a');
  });

  it('read-middleware скрывает удалённые записи из bulkGet', async () => {
    expect((await db.tasks.bulkGet(['a', 'b', 'c', 'd', 'нет'])).map((t) => t?.id)).toEqual([
      'a',
      undefined,
      'c',
      undefined,
      undefined,
    ]);
  });

  it('read-middleware скрывает удалённые записи из toArray', async () => {
    expect(ids(await db.tasks.toArray())).toEqual(['a', 'c', 'e']);
    expect(ids(await db.tasks.orderBy('dueDate').toArray())).toEqual(['a', 'c', 'e']);
    expect(ids(await db.tasks.reverse().toArray())).toEqual(['e', 'c', 'a']);
  });

  it('read-middleware скрывает удалённые записи из where (равенство, диапазон, составной и multiEntry-индекс, anyOf)', async () => {
    expect(ids(await db.tasks.where('priority').equals(1).toArray())).toEqual(['a']);
    expect(ids(await db.tasks.where('dueDate').between('2026-11-02', '2026-11-03', true, true).toArray())).toEqual([
      'c',
    ]);
    expect(ids(await db.tasks.where('tags').equals('учёба').toArray())).toEqual(['c']);
    expect(ids(await db.tasks.where('priority').anyOf([1, 2]).toArray())).toEqual(['a', 'c']);
    expect(ids(await db.tasks.where('id').anyOf(['a', 'b', 'd']).toArray())).toEqual(['a']);
    expect(await db.tasks.where('dueDate').equals('2026-11-02').first()).toBeUndefined();
    expect((await db.tasks.where('dueDate').equals('2026-11-03').first())?.id).toBe('c');
    expect((await db.tasks.where('dueDate').below('2026-11-05').last())?.id).toBe('c');
  });

  it('read-middleware скрывает удалённые записи из count', async () => {
    expect(await db.tasks.count()).toBe(3);
    expect(await db.tasks.where('priority').equals(1).count()).toBe(1);
    expect(await db.tasks.where('dueDate').equals('2026-11-02').count()).toBe(0);
    expect(await db.tasks.where('priority').anyOf([1, 2]).count()).toBe(2);
    expect(await db.tasks.filter((t) => t.priority < 3).count()).toBe(2);
  });

  it('read-middleware скрывает удалённые записи из filter, each, keys и primaryKeys (курсоры)', async () => {
    expect(ids(await db.tasks.filter(() => true).toArray())).toEqual(['a', 'c', 'e']);
    const seen: string[] = [];
    await db.tasks.each((t) => void seen.push(t.id));
    expect(seen).toEqual(['a', 'c', 'e']);

    expect(await db.tasks.toCollection().primaryKeys()).toEqual(['a', 'c', 'e']);
    expect(await db.tasks.where('priority').equals(2).primaryKeys()).toEqual(['c']);
    expect(await db.tasks.filter(() => true).primaryKeys()).toEqual(['a', 'c', 'e']);
    expect(await db.tasks.orderBy('dueDate').keys()).toEqual(['2026-11-01', '2026-11-03', '2026-11-05']);
    // A key whose first row is a tombstone is still found through its live row; a key held only by one is gone.
    expect(await db.tasks.orderBy('dueDate').uniqueKeys()).toEqual(['2026-11-01', '2026-11-03', '2026-11-05']);
    expect(await db.tasks.orderBy('priority').uniqueKeys()).toEqual([1, 2, 3]);
  });

  it('read-middleware не считает удалённые записи в limit и offset', async () => {
    expect(ids(await db.tasks.limit(2).toArray())).toEqual(['a', 'c']);
    expect(ids(await db.tasks.orderBy('dueDate').limit(3).toArray())).toEqual(['a', 'c', 'e']);
    expect(ids(await db.tasks.offset(1).toArray())).toEqual(['c', 'e']);
    expect(ids(await db.tasks.offset(1).limit(1).toArray())).toEqual(['c']);
    expect(await db.tasks.limit(2).primaryKeys()).toEqual(['a', 'c']);
    expect(ids(await db.tasks.reverse().limit(2).toArray())).toEqual(['e', 'c']);
  });

  it('read-middleware скрывает удалённую запись из useLiveQuery: список и счётчик обновляются после softDelete', async () => {
    const { result } = renderHook(() =>
      useLiveQuery(async () => ({
        list: ids(await db.tasks.toArray()),
        byDay: await db.tasks.where('dueDate').equals('2026-11-03').count(),
        one: (await db.tasks.get('c'))?.id,
      })),
    );
    await waitFor(() => expect(result.current).toEqual({ list: ['a', 'c', 'e'], byDay: 1, one: 'c' }));

    await softDelete(db.tasks, 'c');
    await waitFor(() => expect(result.current).toEqual({ list: ['a', 'e'], byDay: 0, one: undefined }));

    // Writing the row again (same id) brings it back to the live query.
    await db.tasks.put(task('c', { dueDate: '2026-11-03' }));
    await waitFor(() => expect(result.current).toEqual({ list: ['a', 'c', 'e'], byDay: 1, one: 'c' }));
  });

  it('softDelete работает внутри транзакции модуля, а откат транзакции возвращает запись', async () => {
    await expect(
      db.transaction('rw', db.tasks, async () => {
        await softDelete(db.tasks, 'a');
        expect(await db.tasks.get('a')).toBeUndefined();
        throw new Error('откат');
      }),
    ).rejects.toThrow('откат');
    expect((await db.tasks.get('a'))?.id).toBe('a');
  });

  it('softDeleteMany помечает несколько записей; повторное удаление и несуществующий id ничего не меняют', async () => {
    vi.setSystemTime(T0 + 2000);
    await softDeleteMany(db.tasks, ['a', 'b', 'нет']);
    await softDeleteMany(db.tasks, []);
    await softDelete(db.tasks, 'd');

    expect(ids(await db.tasks.toArray())).toEqual(['c', 'e']);
    const rows = await stored<Task>('tasks');
    expect(rows.find((t) => t.id === 'a')?.deletedAt).toBe(T0 + 2000);
    // Already a tombstone: the time of the first deletion stays.
    expect(rows.find((t) => t.id === 'b')?.deletedAt).toBe(T0 + 1000);
    expect(rows.find((t) => t.id === 'd')?.deletedAt).toBe(T0 + 1000);
    expect(rows.some((t) => t.id === 'нет')).toBe(false);
  });

  it('update и modify не трогают удалённую запись, а новая запись с тем же id (put или add) её заменяет', async () => {
    expect(await db.tasks.update('b', { title: 'правка удалённой' })).toBe(0);
    expect(await db.tasks.where('priority').equals(1).modify({ title: 'новое' })).toBe(1);
    expect((await stored<Task>('tasks')).find((t) => t.id === 'b')).toEqual({
      id: 'b',
      createdAt: T0,
      updatedAt: T0 + 1000,
      deletedAt: T0 + 1000,
    });

    await db.tasks.put(task('b', { title: 'создана заново' }));
    await db.tasks.add(task('d', { title: 'тоже заново' }));
    expect(await db.tasks.get('b')).toEqual(task('b', { title: 'создана заново' }));
    expect(await db.tasks.get('d')).toEqual(task('d', { title: 'тоже заново' }));
    expect(await db.tasks.count()).toBe(5);
    // A live row still refuses a second add with its id.
    await expect(db.tasks.add(task('a'))).rejects.toThrow();
  });

  it('softDelete ключа настроек: ключ скрыт и помечен, новая запись его возвращает; ключ состояния устройства удаляется физически', async () => {
    await db.settings.bulkPut([
      { key: 'adaptation.baseline', value: { sleepHours: 8 } },
      { key: 'time.pomodoro.running', value: { phase: 'work' } },
    ]);
    vi.setSystemTime(T0 + 2000);
    await softDelete(db.settings, 'adaptation.baseline');
    await softDelete(db.settings, 'time.pomodoro.running');

    expect(await db.settings.get('adaptation.baseline')).toBeUndefined();
    expect(await db.settings.get('time.pomodoro.running')).toBeUndefined();
    // The user's setting leaves a tombstone to sync; device state has nothing to sync and is simply removed.
    expect(await stored('settings')).toEqual([
      { key: 'adaptation.baseline', deletedAt: T0 + 2000, updatedAt: T0 + 2000 },
    ]);
    expect(await outboxKeys('settings')).toEqual(['adaptation.baseline']);

    await db.settings.put({ key: 'adaptation.baseline', value: { sleepHours: 7 } });
    expect(await db.settings.get('adaptation.baseline')).toEqual({
      key: 'adaptation.baseline',
      value: { sleepHours: 7 },
    });
  });
});

describe('contract #274: удалённая запись не держит уникальный ключ', () => {
  const base = { createdAt: T0, updatedAt: T0 };
  const night = (id: string): SleepLog => ({ id, ...base, date: DAY, bedtime: 1, wakeTime: 2, quality: 4 });
  const checkIn = (id: string): CheckIn => ({ id, ...base, date: DAY, energy: 3, focus: 4 });
  const weight = (id: string): WeightLog => ({ id, ...base, date: DAY, kg: 72 });
  const session = (id: string): PlannedSession => ({
    id,
    ...base,
    programId: 'p1',
    date: DAY,
    exercises: [],
    status: 'planned',
  });

  const cases = [
    { table: 'sleepLogs', index: '&date', make: night },
    { table: 'checkIns', index: '&date', make: checkIn },
    { table: 'weightLogs', index: '&date', make: weight },
    { table: 'plannedSessions', index: '&[programId+date]', make: session },
  ] as const;

  it.each(cases)(
    '$table ($index): запись удалена через softDelete → новая запись на тот же ключ создаётся без ошибки, данные не теряются',
    async ({ table, make }) => {
      const t = db.table(table);
      await t.add(make('old'));
      // The unique index is real: a second live row on the key is refused.
      await expect(t.add(make('dup'))).rejects.toThrow();

      vi.setSystemTime(T0 + 2000);
      await softDelete(t, 'old');
      expect(await t.count()).toBe(0);

      // Re-created with a new id — both add and put must work, alone and in bulk.
      vi.setSystemTime(T0 + 3000);
      await t.add(make('new'));
      expect(await t.toArray()).toEqual([make('new')]);
      expect(await t.where('date').equals(DAY).toArray()).toEqual([make('new')]);

      await softDelete(t, 'new');
      await t.bulkPut([make('newer')]);
      expect(await t.toArray()).toEqual([make('newer')]);

      // The tombstones carry no payload, so they never held the key: they stay, next to the new row…
      const tombstone = (id: string, at: number) => ({ id, createdAt: T0, updatedAt: at, deletedAt: at });
      expect(await stored(table)).toEqual([tombstone('new', T0 + 3000), make('newer'), tombstone('old', T0 + 2000)]);
      // …and their deletion is queued for the sync.
      expect(await outboxKeys(table)).toEqual(['new', 'newer', 'old']);
      // A live row keeps the key, as before.
      await expect(t.add(make('dup'))).rejects.toThrow();
      await expect(t.put(make('dup'))).rejects.toThrow();
      expect(await t.toArray()).toEqual([make('newer')]);
    },
  );

  it.each(cases)(
    '$table ($index): tombstone с содержимым (так он может прийти с сервера) не держит уникальный ключ — запись его заменяет',
    async ({ table, make }) => {
      const t = db.table(table);
      // Not what `softDelete` writes: a whole row marked deleted, the way a pull may deliver it.
      await t.put({ ...make('old'), deletedAt: T0 + 2000, updatedAt: T0 + 2000 });
      expect(await t.count()).toBe(0);

      await t.add(make('new'));
      expect(await t.toArray()).toEqual([make('new')]);
      // The tombstone gave the key up and is gone from the store, but its deletion stays queued for the sync.
      expect(await stored(table)).toEqual([make('new')]);
      expect(await outboxKeys(table)).toEqual(['new', 'old']);

      await t.put({ ...make('new'), deletedAt: T0 + 3000 });
      await t.bulkPut([make('newer')]);
      expect(await stored(table)).toEqual([make('newer')]);
    },
  );

  it('запись с тем же id поверх удалённой (будущие детерминированные id) — та же строка, уникальный ключ свободен', async () => {
    await db.sleepLogs.add(night('sleep:2026-11-04'));
    await softDelete(db.sleepLogs, 'sleep:2026-11-04');

    await db.sleepLogs.put({ ...night('sleep:2026-11-04'), quality: 5 });
    expect(await stored('sleepLogs')).toEqual([{ ...night('sleep:2026-11-04'), quality: 5 }]);
    expect((await db.sleepLogs.where('date').equals(DAY).first())?.quality).toBe(5);
  });

  it('удалённая запись на другой ключ не мешает и остаётся на месте', async () => {
    await db.weightLogs.add(weight('w1'));
    await softDelete(db.weightLogs, 'w1');
    await db.weightLogs.add({ ...weight('w2'), date: '2026-11-05' });

    expect((await stored<WeightLog>('weightLogs')).map((w) => w.id).sort()).toEqual(['w1', 'w2']);
    expect((await db.weightLogs.toArray()).map((w) => w.id)).toEqual(['w2']);
  });
});
