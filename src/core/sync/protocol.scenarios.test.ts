import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSyncServer } from '../../test/fakeSyncServer';
import { naturalId } from '../ids';
import type { SyncOutboxEntry } from '../types';
import {
  applyPull,
  applyPushResult,
  buildPush,
  buildReplace,
  isFullSyncDue,
  staleAfterFullPull,
  type LocalRow,
  type LocalState,
  type PulledChange,
  type RowData,
  type SyncConflict,
  type SyncPlan,
} from './protocol';

/**
 * The scenario table of ADR-0009 (sync p. 10): whole devices talking to a server, built only from the pure
 * functions of `protocol.ts`. `Device` is what the engine will be — it stores rows and the queue the way IndexedDB
 * and the outbox middleware do, and executes the plans; `FakeSyncServer` follows the rules of the real server.
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const START = Date.UTC(2026, 10, 5, 6, 0);

/** The world's clock; a device may run ahead of it (`skew`). */
let worldNow = START;
const pass = (ms: number): void => {
  worldNow += ms;
};

const idOf = (table: string, key: string): string => `${table}\u0000${key}`;
const keyOf = ({ table, row }: LocalRow): string => String(table === 'settings' ? row.key : row.id);

/**
 * The unique indexes of `core/db.ts` besides the primary key (`&date`, `&[programId+date]`). IndexedDB refuses a
 * second live row with the same values — and the transaction of the whole plan with it.
 */
const UNIQUE_INDEXES: Record<string, readonly string[]> = {
  sleepLogs: ['date'],
  checkIns: ['date'],
  weightLogs: ['date'],
  plannedSessions: ['programId', 'date'],
};
const indexed = ({ table, row }: LocalRow): string | undefined => {
  const fields = UNIQUE_INDEXES[table];
  if (!fields || fields.some((field) => typeof row[field] !== 'string')) return undefined;
  return fields.map((field) => String(row[field])).join('\u0000');
};

class Device {
  readonly rows = new Map<string, LocalRow>();
  readonly outbox = new Map<string, SyncOutboxEntry>();
  readonly conflicts: SyncConflict[] = [];
  lastPulledRev = 0;
  lastSyncedAt: number | undefined;
  readonly id: string;
  /** How far this device's clock runs ahead of the world's. */
  private readonly skew: number;

  constructor(id: string, skew = 0) {
    this.id = id;
    this.skew = skew;
  }

  private now(): number {
    return worldNow + this.skew;
  }

  private queue(table: string, key: string): void {
    this.outbox.set(idOf(table, key), { table, key, updatedAt: this.now() });
  }

  /** `put`: like IndexedDB, fails when another live row of the table holds the row's unique key. */
  private store(row: LocalRow): void {
    const unique = indexed(row);
    for (const other of this.rows.values()) {
      if (unique === undefined || other.table !== row.table || keyOf(other) === keyOf(row)) continue;
      if (indexed(other) === unique) throw new Error(`ConstraintError: ${row.table} ${keyOf(row)} / ${keyOf(other)}`);
    }
    this.rows.set(idOf(row.table, keyOf(row)), row);
  }

  private state(): LocalState {
    return { rows: [...this.rows.values()], outbox: [...this.outbox.values()], deviceId: this.id };
  }

  // ---- what modules do; the outbox middleware queues every write ----

  /** Creates or edits a record: the fields replace the stored ones, `updatedAt` is this device's clock. */
  save(table: string, key: string, fields: RowData): void {
    const stored = this.rows.get(idOf(table, key))?.row;
    const createdAt = stored?.deletedAt === undefined ? (stored?.createdAt ?? this.now()) : this.now();
    this.store({ table, row: { ...fields, id: key, createdAt, updatedAt: this.now() } });
    this.queue(table, key);
  }

  /** A setting as modules write it: `{ key, value }`, no times. */
  setSetting(key: string, value: unknown): void {
    this.rows.set(idOf('settings', key), { table: 'settings', row: { key, value } });
    this.queue('settings', key);
  }

  /** `softDelete()`: the row becomes a tombstone without content. */
  softDelete(table: string, key: string): void {
    const createdAt = this.rows.get(idOf(table, key))?.row.createdAt;
    this.rows.set(idOf(table, key), {
      table,
      row: { id: key, createdAt, updatedAt: this.now(), deletedAt: this.now() },
    });
    this.queue(table, key);
  }

  /** A physical delete: no row is left, only the queue entry. */
  hardDelete(table: string, key: string): void {
    this.rows.delete(idOf(table, key));
    this.queue(table, key);
  }

  /** `importAll()`: everything is replaced by the rows of a backup; what was removed and what was added is queued. */
  importBackup(backup: readonly LocalRow[]): void {
    for (const row of this.rows.values()) this.queue(row.table, keyOf(row));
    this.rows.clear();
    for (const row of backup) {
      this.rows.set(idOf(row.table, keyOf(row)), { table: row.table, row: { ...row.row } });
      this.queue(row.table, keyOf(row));
    }
  }

  /** The rows a module reads: live ones, without the sync fields the modules never look at. */
  read(table: string): RowData[] {
    return [...this.rows.values()]
      .filter((row) => row.table === table && row.row.deletedAt === undefined)
      .map(({ row: { updatedBy: _updatedBy, ...row } }) => row)
      .sort((a, b) => (keyOf({ table, row: a }) < keyOf({ table, row: b }) ? -1 : 1));
  }

  // ---- what the engine does ----

  /** One transaction: the removals first, then the writes in the order of the plan (`SyncPlan`). */
  private execute(plan: SyncPlan): void {
    for (const { table, key } of plan.remove) this.rows.delete(idOf(table, key));
    for (const row of plan.put) this.store(row);
    for (const { table, key, updatedAt } of plan.settled) {
      if (this.outbox.get(idOf(table, key))?.updatedAt === updatedAt) this.outbox.delete(idOf(table, key));
    }
    this.conflicts.push(...plan.conflicts);
  }

  private push(server: FakeSyncServer, replace?: readonly PulledChange[]): void {
    const state = this.state();
    const changes = replace
      ? buildReplace(replace, state.rows, { deviceId: this.id, now: this.now() })
      : buildPush(state.outbox, state.rows, { deviceId: this.id });
    const results = server.push(changes, { since: this.lastPulledRev, replace: replace !== undefined });
    this.execute(applyPushResult(results, state));
  }

  /** Pulls page by page (two changes a page, so every scenario crosses a page border). */
  private pull(server: FakeSyncServer, since: number): PulledChange[] {
    const pulled: PulledChange[] = [];
    for (let cursor = since; ;) {
      const page = server.changesSince(cursor, 2);
      if (page.length === 0) break;
      const plan = applyPull(page, this.state());
      this.execute(plan);
      cursor = plan.cursor;
      this.lastPulledRev = Math.max(this.lastPulledRev, cursor);
      pulled.push(...page);
    }
    return pulled;
  }

  /** One sync: push the queue, then pull. After too long offline — a full pull and the removal of stale rows. */
  sync(server: FakeSyncServer): void {
    const full = isFullSyncDue(this.lastSyncedAt, this.now());
    this.push(server);
    const pulled = this.pull(server, full ? 0 : this.lastPulledRev);
    if (full) {
      for (const { table, key } of staleAfterFullPull(pulled, this.state())) this.rows.delete(idOf(table, key));
    }
    this.lastSyncedAt = this.now();
  }

  /** «Replace the data in the cloud» after `importBackup()`. */
  replaceCloud(server: FakeSyncServer): void {
    this.push(server, server.changesSince(0, Number.MAX_SAFE_INTEGER));
    this.pull(server, this.lastPulledRev);
    this.lastSyncedAt = this.now();
  }
}

let server: FakeSyncServer;
let phone: Device;
let laptop: Device;

beforeEach(() => {
  worldNow = START;
  server = new FakeSyncServer(() => worldNow);
  phone = new Device('device-phone');
  laptop = new Device('device-laptop');
});

const everywhere = (table: string): RowData[][] => [phone.read(table), laptop.read(table)];
/** Every device syncs until nothing is left to send or to get. */
const syncAll = (...devices: Device[]): void => {
  const order = devices.length > 0 ? devices : [phone, laptop];
  for (let round = 0; round < 3; round += 1) for (const device of order) device.sync(server);
};

const mealId = naturalId('meal', '2026-11-05', 'lunch');
const lunch = (items: RowData[]): RowData => ({ date: '2026-11-05', kind: 'lunch', time: START, items });
/** A meal item written at `at` — the clock of the device that writes it. */
const item = (id: string, grams = 100, at = worldNow): RowData => ({ id, foodId: `food-${id}`, grams, updatedAt: at });
const itemsOf = (meal: RowData | undefined): RowData[] => (meal?.items ?? []) as RowData[];
const liveItems = (device: Device): RowData[] =>
  itemsOf(device.read('mealLogs')[0]).filter((i) => i.deletedAt === undefined);
const itemIds = (device: Device): string[] => liveItems(device).map((i) => String(i.id));
const gramsOf = (device: Device, id: string): unknown => liveItems(device).find((i) => i.id === id)?.grams;

describe('таблица сценариев ADR-0009, п. 10', () => {
  it('два устройства: запись, созданная на одном, появляется на другом; правка возвращается обратно', () => {
    phone.save('tasks', 't1', { title: 'Купить молоко' });
    phone.save('notes', 'n1', { title: 'План', body: 'текст' });
    phone.setSetting('time.pomodoro', { focusMin: 25 });
    phone.sync(server);
    laptop.sync(server);
    expect(laptop.read('tasks')).toEqual(phone.read('tasks'));
    expect(laptop.read('notes')).toEqual(phone.read('notes'));
    // A setting is written without a time: the queue entry's time travels with it.
    expect(laptop.read('settings')).toEqual([{ key: 'time.pomodoro', value: { focusMin: 25 }, updatedAt: START }]);

    pass(MINUTE);
    laptop.save('tasks', 't1', { title: 'Купить молоко и хлеб' });
    laptop.sync(server);
    phone.sync(server);

    expect(phone.read('tasks')).toEqual([
      { id: 't1', title: 'Купить молоко и хлеб', createdAt: START, updatedAt: START + MINUTE },
    ]);
    expect(laptop.read('tasks')).toEqual(phone.read('tasks'));
    expect(phone.rows.get(idOf('tasks', 't1'))?.row.updatedBy).toBe('device-laptop');
    expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
    expect([phone.conflicts, laptop.conflicts]).toEqual([[], []]);
    expect(phone.lastPulledRev).toBe(laptop.lastPulledRev);
  });

  it('офлайн-очередь: правки без сети копятся по одной записи на строку и уходят при первой синхронизации', () => {
    phone.save('tasks', 't1', { title: 'Черновик' });
    pass(MINUTE);
    phone.save('tasks', 't1', { title: 'Черновик 2' });
    phone.save('tasks', 't2', { title: 'Передумал' });
    pass(MINUTE);
    phone.softDelete('tasks', 't2');
    phone.save('tasks', 't3', { title: 'Удалена физически' });
    phone.hardDelete('tasks', 't3');
    pass(MINUTE);
    phone.save('tasks', 't1', { title: 'Готово' });
    expect(phone.outbox.size).toBe(3);

    pass(DAY);
    phone.sync(server);
    expect(phone.outbox.size).toBe(0);
    expect(server.changesSince(0).map(({ key, deletedAt, data }) => [key, deletedAt, data?.title])).toEqual([
      ['t2', START + 2 * MINUTE, undefined],
      ['t3', START + 2 * MINUTE, undefined],
      ['t1', undefined, 'Готово'],
    ]);

    laptop.sync(server);
    expect(laptop.read('tasks')).toEqual([
      { id: 't1', title: 'Готово', createdAt: START, updatedAt: START + 3 * MINUTE },
    ]);
    expect(laptop.read('tasks')).toEqual(phone.read('tasks'));
  });

  describe('удаление против правки', () => {
    beforeEach(() => {
      phone.save('tasks', 't1', { title: 'Общая' });
      phone.sync(server);
      laptop.sync(server);
    });

    it('правка позже удаления — запись возвращается на оба устройства, удаление попадает в конфликты', () => {
      pass(MINUTE);
      phone.softDelete('tasks', 't1');
      pass(MINUTE);
      laptop.save('tasks', 't1', { title: 'Правка после удаления' });

      laptop.sync(server);
      phone.sync(server);
      laptop.sync(server);

      expect(phone.read('tasks')).toMatchObject([{ id: 't1', title: 'Правка после удаления' }]);
      expect(laptop.read('tasks')).toEqual(phone.read('tasks'));
      expect(phone.conflicts).toMatchObject([{ local: { key: 't1', deletedAt: START + MINUTE } }]);
      expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
    });

    it('удаление позже правки — записи нет нигде, проигравшая правка попадает в конфликты', () => {
      pass(MINUTE);
      laptop.save('tasks', 't1', { title: 'Правка до удаления' });
      pass(MINUTE);
      phone.softDelete('tasks', 't1');

      phone.sync(server);
      laptop.sync(server);
      phone.sync(server);

      expect(everywhere('tasks')).toEqual([[], []]);
      expect(laptop.conflicts).toMatchObject([{ local: { key: 't1', data: { title: 'Правка до удаления' } } }]);
      expect(server.changesSince(0)).toMatchObject([{ key: 't1', deletedAt: START + 2 * MINUTE }]);
      expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
    });

    it('тот же исход при другом порядке синхронизации: сервер не даёт ранней правке перезаписать позднее удаление', () => {
      pass(MINUTE);
      laptop.save('tasks', 't1', { title: 'Правка до удаления' });
      pass(MINUTE);
      phone.softDelete('tasks', 't1');

      laptop.sync(server);
      phone.sync(server);
      laptop.sync(server);

      expect(everywhere('tasks')).toEqual([[], []]);
      expect(server.changesSince(0)).toMatchObject([{ key: 't1', deletedAt: START + 2 * MINUTE }]);
    });
  });

  it('часы в будущем: сервер подрезает время до своего, запись не застревает в очереди и не блокирует поздние правки', () => {
    const fromFuture = new Device('device-future', 2 * DAY);
    fromFuture.save('tasks', 't1', { title: 'Из будущего' });
    fromFuture.save('tasks', 't2', { title: 'Тоже из будущего' });
    fromFuture.sync(server);

    expect(fromFuture.outbox.size).toBe(0);
    expect(server.changesSince(0).map((change) => change.updatedAt)).toEqual([START, START]);
    // The echo of the push brings the device the time the server stored.
    expect(fromFuture.read('tasks').map((row) => row.updatedAt)).toEqual([START, START]);

    pass(MINUTE);
    laptop.sync(server);
    laptop.save('tasks', 't1', { title: 'Правка с верными часами' });
    laptop.sync(server);
    fromFuture.sync(server);

    expect(fromFuture.read('tasks')).toMatchObject([
      { title: 'Правка с верными часами' },
      { title: 'Тоже из будущего' },
    ]);
    expect(fromFuture.read('tasks')).toEqual(laptop.read('tasks'));
  });

  it('часы в будущем: расхождение в пределах пяти минут сервер оставляет как есть', () => {
    const slightlyAhead = new Device('device-ahead', 4 * MINUTE);
    slightlyAhead.save('tasks', 't1', { title: 'Чуть вперёд' });
    slightlyAhead.sync(server);
    expect(server.changesSince(0)).toMatchObject([{ updatedAt: START + 4 * MINUTE }]);
  });

  it('часы отстают: правка, которую сервер не принял, заменяется его версией и попадает в конфликты', () => {
    phone.save('tasks', 't1', { title: 'Общая' });
    phone.sync(server);
    const behind = new Device('device-behind', -DAY);
    behind.sync(server);
    pass(MINUTE);
    behind.save('tasks', 't1', { title: 'Правка со старыми часами' });
    behind.sync(server);

    expect(behind.read('tasks')).toEqual(phone.read('tasks'));
    expect(behind.outbox.size).toBe(0);
    expect(behind.conflicts).toMatchObject([{ local: { data: { title: 'Правка со старыми часами' } } }]);
  });

  describe('часы в будущем: время элемента приёма пищи сервер подрезает вместе со временем записи', () => {
    for (const first of ['ноутбук', 'телефон'] as const) {
      it(`поздняя правка веса с верными часами не проигрывает элементу «из будущего» (первым синхронизируется ${first})`, () => {
        const ahead = new Device('device-phone', DAY);
        ahead.save('mealLogs', mealId, lunch([item('суп', 300, worldNow + DAY)]));
        ahead.sync(server);
        laptop.sync(server);
        expect(itemsOf(server.changesSince(0)[0].data)).toMatchObject([{ id: 'суп', updatedAt: START }]);
        // The echo of the push brings the device the item time the server stored.
        expect(liveItems(ahead)).toMatchObject([{ id: 'суп', updatedAt: START }]);

        pass(120 * MINUTE);
        // The laptop (its clock is right) changes the soup's weight; the phone, not knowing that, adds tea.
        laptop.save('mealLogs', mealId, lunch([{ ...liveItems(laptop)[0], grams: 200, updatedAt: worldNow }]));
        ahead.save('mealLogs', mealId, lunch([...liveItems(ahead), item('чай', 100, worldNow + DAY)]));

        syncAll(...(first === 'ноутбук' ? [laptop, ahead] : [ahead, laptop]));

        for (const device of [ahead, laptop]) {
          expect(itemIds(device).toSorted()).toEqual(['суп', 'чай']);
          expect(gramsOf(device, 'суп')).toBe(200);
        }
        expect(laptop.read('mealLogs')).toEqual(ahead.read('mealLogs'));
        expect([ahead.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
      });
    }
  });

  describe('один и тот же день на двух устройствах', () => {
    const day = '2026-11-05';
    const id = naturalId('checkIn', day);

    beforeEach(() => {
      phone.save('checkIns', id, { date: day, energy: 2, focus: 2 });
      pass(MINUTE);
      laptop.save('checkIns', id, { date: day, energy: 4, focus: 5 });
    });

    it('обе записи офлайн получают один id — на сервере одна запись, побеждает более поздняя', () => {
      phone.sync(server);
      laptop.sync(server);
      phone.sync(server);

      expect(server.changesSince(0)).toHaveLength(1);
      expect(phone.read('checkIns')).toEqual([
        {
          id: 'checkIn:2026-11-05',
          date: day,
          energy: 4,
          focus: 5,
          createdAt: START + MINUTE,
          updatedAt: START + MINUTE,
        },
      ]);
      expect(laptop.read('checkIns')).toEqual(phone.read('checkIns'));
    });

    it('тот же исход, если более поздняя запись пришла на сервер первой; ранняя сохранена в конфликтах', () => {
      laptop.sync(server);
      phone.sync(server);

      expect(server.changesSince(0)).toHaveLength(1);
      expect(phone.read('checkIns')).toMatchObject([{ energy: 4, focus: 5 }]);
      expect(laptop.read('checkIns')).toEqual(phone.read('checkIns'));
      expect(phone.conflicts).toMatchObject([{ local: { data: { energy: 2 } }, remote: { data: { energy: 4 } } }]);
      expect(phone.outbox.size).toBe(0);
    });
  });

  describe('два устройства добавляют в один приём пищи', () => {
    it('оба продукта остаются на обоих устройствах и на сервере', () => {
      phone.save('mealLogs', mealId, lunch([item('суп')]));
      pass(MINUTE);
      laptop.save('mealLogs', mealId, lunch([item('хлеб')]));

      phone.sync(server);
      laptop.sync(server);
      // The server kept the phone's meal: the laptop has not seen it, so its version may not overwrite it.
      expect(server.changesSince(0)).toMatchObject([{ updatedBy: 'device-phone' }]);
      syncAll();

      expect(itemIds(phone).toSorted()).toEqual(['суп', 'хлеб']);
      expect(laptop.read('mealLogs')).toEqual(phone.read('mealLogs'));
      expect(server.changesSince(0)).toHaveLength(1);
      expect(
        itemsOf(server.changesSince(0)[0].data)
          .map((i) => i.id)
          .toSorted(),
      ).toEqual(['суп', 'хлеб']);
      expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
      expect([phone.conflicts, laptop.conflicts]).toEqual([[], []]);
    });

    it('тот же исход при любом порядке синхронизации', () => {
      phone.save('mealLogs', mealId, lunch([item('суп')]));
      pass(MINUTE);
      laptop.save('mealLogs', mealId, lunch([item('хлеб')]));

      laptop.sync(server);
      phone.sync(server);
      syncAll();

      expect(itemIds(phone).toSorted()).toEqual(['суп', 'хлеб']);
      expect(laptop.read('mealLogs')).toEqual(phone.read('mealLogs'));
    });

    it('оба дописывают в уже общий приём пищи; правка веса и удаление продукта не теряются и не возвращаются', () => {
      phone.save('mealLogs', mealId, lunch([item('суп'), item('хлеб')]));
      phone.sync(server);
      laptop.sync(server);
      const shared = phone.read('mealLogs')[0].items as RowData[];

      pass(MINUTE);
      // The phone removes the bread (a tombstone on the item) and adds tea.
      phone.save(
        'mealLogs',
        mealId,
        lunch([shared[0], { ...shared[1], updatedAt: worldNow, deletedAt: worldNow }, item('чай')]),
      );
      pass(MINUTE);
      // The laptop, not knowing that, changes the soup's weight and adds an apple.
      laptop.save(
        'mealLogs',
        mealId,
        lunch([{ ...shared[0], grams: 350, updatedAt: worldNow }, shared[1], item('яблоко')]),
      );

      syncAll();

      expect(itemIds(phone).toSorted()).toEqual(['суп', 'чай', 'яблоко']);
      expect(gramsOf(phone, 'суп')).toBe(350);
      expect(laptop.read('mealLogs')).toEqual(phone.read('mealLogs'));
      expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
    });
  });

  describe('удаление последнего продукта против продукта, добавленного на другом устройстве', () => {
    beforeEach(() => {
      phone.save('mealLogs', mealId, lunch([item('суп')]));
      phone.sync(server);
      laptop.sync(server);

      pass(MINUTE);
      laptop.save('mealLogs', mealId, lunch([...liveItems(laptop), item('яблоко')]));
      pass(MINUTE);
      // The phone, not knowing that, removes the soup: the meal is left without items, and nutrition removes a
      // meal with its last item (ADR-0011, p. 9) — a tombstone that says nothing about the apple.
      phone.softDelete('mealLogs', mealId);
    });

    it('продукт другого устройства остаётся везде; удаление, которое его не видело, попадает в конфликты', () => {
      laptop.sync(server);
      phone.sync(server);
      syncAll();

      expect(itemIds(laptop)).toContain('яблоко');
      expect(phone.read('mealLogs')).toEqual(laptop.read('mealLogs'));
      expect(server.changesSince(0)).toMatchObject([{ key: mealId, updatedBy: 'device-laptop' }]);
      expect(server.changesSince(0)[0].deletedAt).toBeUndefined();
      expect(phone.conflicts).toMatchObject([{ local: { key: mealId, deletedAt: START + 2 * MINUTE } }]);
      expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
    });

    it('тот же исход, если удаление пришло на сервер первым: приём пищи с продуктом возвращается', () => {
      phone.sync(server);
      laptop.sync(server);
      syncAll();

      expect(itemIds(laptop)).toContain('яблоко');
      expect(phone.read('mealLogs')).toEqual(laptop.read('mealLogs'));
      expect(server.changesSince(0)).toHaveLength(1);
      expect(server.changesSince(0)[0].deletedAt).toBeUndefined();
      expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
    });
  });

  describe('уникальный ключ не из id: одна сессия программы на день (plannedSessions, &[programId+date])', () => {
    const [MON, TUE, WED, THU, FRI] = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
    const session = (date: string): RowData => ({ programId: 'p1', date, status: 'planned', exercises: [] });
    const days = (device: Device): unknown[][] => device.read('plannedSessions').map((row) => [row.id, row.date]);
    const onServer = (): unknown[][] =>
      server
        .changesSince(0)
        .filter((change) => change.table === 'plannedSessions')
        .map(({ key, deletedAt, data }) => [key, deletedAt === undefined ? data?.date : 'удалена'])
        .toSorted();

    beforeEach(() => {
      phone.save('plannedSessions', 's1', session(MON));
      phone.save('plannedSessions', 's2', session(WED));
      phone.sync(server);
      laptop.sync(server);
    });

    describe('два устройства переносят разные сессии одной программы на один день', () => {
      beforeEach(() => {
        pass(MINUTE);
        phone.save('plannedSessions', 's1', session(THU));
        pass(MINUTE);
        laptop.save('plannedSessions', 's2', session(THU));
      });

      it('день остаётся за сессией, которая пришла на сервер первой; перенос второй попадает в конфликты, синхронизация не останавливается', () => {
        phone.sync(server);
        laptop.sync(server);
        syncAll();

        expect(days(phone)).toEqual([['s1', THU]]);
        expect(days(laptop)).toEqual(days(phone));
        // The server holds what the devices hold: the session that lost the day is deleted, not left as a second
        // live row of that day.
        expect(onServer()).toEqual([
          ['s1', THU],
          ['s2', 'удалена'],
        ]);
        expect(laptop.conflicts).toMatchObject([
          { local: { key: 's2', data: { date: THU } }, remote: { key: 's1', data: { date: THU } } },
        ]);
        expect(phone.conflicts).toEqual([]);
        expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
      });

      it('тот же исход при другом порядке синхронизации: первым пришёл перенос с ноутбука', () => {
        laptop.sync(server);
        phone.sync(server);
        syncAll();

        expect(days(phone)).toEqual([['s2', THU]]);
        expect(days(laptop)).toEqual(days(phone));
        expect(onServer()).toEqual([
          ['s1', 'удалена'],
          ['s2', THU],
        ]);
        expect(phone.conflicts).toMatchObject([{ local: { key: 's1', data: { date: THU } }, remote: { key: 's2' } }]);
        expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
      });

      it('новое устройство после такого конфликта получает то же, что остальные', () => {
        phone.sync(server);
        laptop.sync(server);
        syncAll();
        const tablet = new Device('device-tablet');
        tablet.sync(server);
        expect(days(tablet)).toEqual(days(phone));
      });
    });

    for (const pages of ['в одной странице pull', 'в разных страницах pull'] as const) {
      it(`одно устройство переставляет сессии: получатель освобождает занятый день и не теряет ни одной (${pages})`, () => {
        // s2 leaves Wednesday, s1 takes it, s2 moves once more: s1 reaches the server before the last move of s2.
        pass(MINUTE);
        phone.save('plannedSessions', 's2', session(FRI));
        pass(MINUTE);
        phone.save('plannedSessions', 's1', session(WED));
        // A pull page is two changes: one more change in between puts the two sessions on different pages.
        if (pages === 'в разных страницах pull') phone.save('tasks', 't1', { title: 'между переносами' });
        pass(MINUTE);
        phone.save('plannedSessions', 's2', session(TUE));

        phone.sync(server);
        laptop.sync(server);

        expect(days(laptop)).toEqual([
          ['s1', WED],
          ['s2', TUE],
        ]);
        expect(days(laptop)).toEqual(days(phone));
        expect([phone.conflicts, laptop.conflicts]).toEqual([[], []]);
        expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
      });
    }

    it('два устройства продлевают одну программу на те же дни: остаются сессии первого, второе не упирается в занятые дни', () => {
      pass(MINUTE);
      phone.save('plannedSessions', 'phone-thu', session(THU));
      phone.save('plannedSessions', 'phone-fri', session(FRI));
      pass(MINUTE);
      laptop.save('plannedSessions', 'laptop-thu', session(THU));
      laptop.save('plannedSessions', 'laptop-fri', session(FRI));

      phone.sync(server);
      laptop.sync(server);
      syncAll();

      expect(days(phone)).toEqual([
        ['phone-fri', FRI],
        ['phone-thu', THU],
        ['s1', MON],
        ['s2', WED],
      ]);
      expect(days(laptop)).toEqual(days(phone));
      expect(laptop.conflicts.map((conflict) => conflict.local.key).toSorted()).toEqual(['laptop-fri', 'laptop-thu']);
      expect([phone.outbox.size, laptop.outbox.size]).toEqual([0, 0]);
    });
  });

  it('устройство после 90 дней офлайн: очередь уходит, полный pull, записи без tombstone на сервере удаляются с устройства', () => {
    for (const key of ['t1', 't2', 't3']) phone.save('tasks', key, { title: key });
    phone.sync(server);
    laptop.sync(server);

    // The phone goes offline; it edits t3 and creates t5 there.
    pass(DAY);
    phone.save('tasks', 't3', { title: 't3, правка офлайн' });
    phone.save('tasks', 't5', { title: 't5, создана офлайн' });
    // Meanwhile the laptop deletes t2 and creates t4.
    laptop.softDelete('tasks', 't2');
    laptop.save('tasks', 't4', { title: 't4' });
    laptop.sync(server);

    pass(91 * DAY);
    server.expireTombstones();
    // An ordinary pull would no longer tell the phone that t2 was deleted.
    expect(server.changesSince(phone.lastPulledRev).map((change) => change.key)).toEqual(['t4']);

    phone.sync(server);
    laptop.sync(server);

    expect(phone.read('tasks').map((row) => row.title)).toEqual([
      't1',
      't3, правка офлайн',
      't4',
      't5, создана офлайн',
    ]);
    expect(laptop.read('tasks')).toEqual(phone.read('tasks'));
    expect(phone.outbox.size).toBe(0);
  });

  it('устройство, которое ещё ни разу не синхронизировалось, ничего не удаляет: первая синхронизация — обычная', () => {
    phone.save('tasks', 't1', { title: 'С телефона' });
    phone.sync(server);
    laptop.save('tasks', 't2', { title: 'Старые локальные данные' });
    laptop.outbox.clear(); // rows written before the queue existed (ADR-0010) are not queued
    pass(200 * DAY);
    laptop.sync(server);
    expect(laptop.read('tasks').map((row) => row.id)).toEqual(['t1', 't2']);
  });

  it('восстановление копии при включённом аккаунте: облако становится равным копии, другие устройства получают её', () => {
    phone.save('tasks', 't1', { title: 't1 в копии' });
    phone.save('tasks', 't2', { title: 't2 в копии' });
    phone.sync(server);
    laptop.sync(server);
    const backup = [...phone.rows.values()].map(({ table, row: { updatedBy: _updatedBy, ...row } }) => ({
      table,
      row,
    }));

    // After the backup: the laptop edits t1 and creates t3, the phone deletes t2 and creates t4.
    pass(DAY);
    laptop.save('tasks', 't1', { title: 't1 после копии' });
    laptop.save('tasks', 't3', { title: 't3 после копии' });
    laptop.sync(server);
    phone.softDelete('tasks', 't2');
    phone.save('tasks', 't4', { title: 't4 после копии' });
    phone.sync(server);

    pass(DAY);
    phone.importBackup(backup);
    phone.replaceCloud(server);
    laptop.sync(server);

    const restored = [
      { id: 't1', title: 't1 в копии', createdAt: START, updatedAt: START },
      { id: 't2', title: 't2 в копии', createdAt: START, updatedAt: START },
    ];
    expect(phone.read('tasks')).toEqual(restored);
    expect(laptop.read('tasks')).toEqual(restored);
    expect(
      server
        .changesSince(0)
        .map(({ key, deletedAt, data }) => [key, deletedAt === undefined ? data?.title : 'удалена'])
        .toSorted(),
    ).toEqual([
      ['t1', 't1 в копии'],
      ['t2', 't2 в копии'],
      ['t3', 'удалена'],
      ['t4', 'удалена'],
    ]);
    expect(phone.outbox.size).toBe(0);
  });
});
