import { describe, expect, it } from 'vitest';
import type { SyncOutboxEntry } from '../types';
import {
  applyPull,
  applyPushResult,
  buildPush,
  buildReplace,
  isFullSyncDue,
  merge,
  staleAfterFullPull,
  TOMBSTONE_TTL_MS,
  type LocalRow,
  type PulledChange,
  type SyncChange,
} from './protocol';

const A = 'device-a';
const B = 'device-b';

const change = (patch: Partial<SyncChange> = {}): SyncChange => ({
  table: 'tasks',
  key: 't1',
  updatedAt: 100,
  updatedBy: A,
  data: { title: 'Задача', createdAt: 1 },
  ...patch,
});
const tombstone = (patch: Partial<SyncChange> = {}): SyncChange => {
  const { data: _data, ...rest } = change(patch);
  return { ...rest, deletedAt: rest.updatedAt };
};
const pulled = (rev: number, patch: Partial<SyncChange> = {}): PulledChange => ({ ...change(patch), rev });
const entry = (table: string, key: string, updatedAt: number): SyncOutboxEntry => ({ table, key, updatedAt });
const item = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({
  id,
  foodId: `food-${id}`,
  grams: 100,
  updatedAt,
  ...extra,
});
const meal = (updatedAt: number, updatedBy: string, items: unknown[], extra: Record<string, unknown> = {}) =>
  change({
    table: 'mealLogs',
    key: 'meal:2026-11-05:lunch',
    updatedAt,
    updatedBy,
    data: { date: '2026-11-05', kind: 'lunch', time: 1, createdAt: 1, items, ...extra },
  });
const itemsOf = (c: SyncChange) => ((c.data?.items ?? []) as { id: string }[]).map((i) => i.id);

describe('merge(localRow, remoteRow) — правила ADR-0009', () => {
  it('last-writer-wins по updatedAt: побеждает более поздняя запись, с какой бы стороны она ни была', () => {
    const older = change({ updatedAt: 100, updatedBy: A });
    const newer = change({ updatedAt: 200, updatedBy: B, data: { title: 'Новее' } });
    expect(merge(older, newer)).toBe(newer);
    expect(merge(newer, older)).toBe(newer);
  });

  it('при равном updatedAt побеждает больший updatedBy — оба устройства выбирают одну запись', () => {
    const byA = change({ updatedAt: 100, updatedBy: A });
    const byB = change({ updatedAt: 100, updatedBy: B });
    expect(merge(byA, byB)).toBe(byB);
    expect(merge(byB, byA)).toBe(byB);
  });

  it('одна и та же версия (то же время и устройство) — берётся серверная', () => {
    const local = change();
    const remote = change();
    expect(merge(local, remote)).toBe(remote);
  });

  it('tombstone: удаление позже правки побеждает, правка позже удаления возвращает запись', () => {
    const edit = change({ updatedAt: 200, updatedBy: B });
    expect(merge(tombstone({ updatedAt: 300 }), edit).deletedAt).toBe(300);
    expect(merge(edit, tombstone({ updatedAt: 300 })).deletedAt).toBe(300);
    expect(merge(tombstone({ updatedAt: 100 }), edit)).toBe(edit);
    expect(merge(edit, tombstone({ updatedAt: 100 }))).toBe(edit);
  });

  it('MealLog.items сливаются по id: продукты обоих устройств остаются, поля записи — от более поздней', () => {
    const local = meal(100, A, [item('a', 100)], { time: 11 });
    const remote = meal(200, B, [item('b', 200)], { time: 22 });
    const merged = merge(local, remote);
    expect(itemsOf(merged)).toEqual(['b', 'a']);
    expect(merged.data?.time).toBe(22);
  });

  it('слитый приём пищи — новая версия этого устройства, позже обеих: сервер примет её поверх своей', () => {
    const merged = merge(meal(100, A, [item('a', 100)]), meal(200, B, [item('b', 200)]));
    expect(merged).toMatchObject({ updatedAt: 201, updatedBy: A });
  });

  it('правка элемента — LWW по updatedAt элемента, даже если сама запись старше', () => {
    const local = meal(300, A, [item('a', 100, { grams: 100 }), item('c', 300)]);
    const remote = meal(200, B, [item('a', 200, { grams: 250 })]);
    const merged = merge(local, remote);
    expect(merged.data?.items).toEqual([item('a', 200, { grams: 250 }), item('c', 300)]);
  });

  it('удаление элемента — tombstone на элементе: слияние не возвращает удалённый продукт', () => {
    const local = meal(100, A, [item('a', 50), item('b', 100)]);
    const remote = meal(200, B, [item('a', 200, { deletedAt: 200 })]);
    const merged = merge(local, remote);
    expect(merged.data?.items).toEqual([item('a', 200, { deletedAt: 200 }), item('b', 100)]);
  });

  it('у сервера уже есть все элементы устройства — берётся серверная запись без новой версии', () => {
    const local = meal(100, A, [item('a', 100)]);
    const remote = meal(200, B, [item('a', 100), item('b', 200)]);
    expect(merge(local, remote)).toBe(remote);
  });

  it('у устройства есть всё, что на сервере, и оно позже — остаётся локальная запись', () => {
    const local = meal(300, A, [item('a', 100), item('b', 300)]);
    const remote = meal(200, B, [item('a', 100)]);
    expect(merge(local, remote)).toBe(local);
  });

  it('удалённый приём пищи против добавленного продукта — обычный LWW по записи', () => {
    const deleted = tombstone({ table: 'mealLogs', key: 'meal:2026-11-05:lunch', updatedAt: 300, updatedBy: A });
    const remote = meal(200, B, [item('b', 200)]);
    expect(merge(deleted, remote)).toBe(deleted);
    expect(merge(remote, deleted)).toBe(deleted);
  });

  it('испорченный список items не роняет слияние', () => {
    const local = meal(100, A, [item('a', 100), 'мусор', { foodId: 'без id' }]);
    const remote = change({ table: 'mealLogs', key: 'meal:2026-11-05:lunch', updatedAt: 200, updatedBy: B, data: {} });
    expect(itemsOf(merge(local, remote))).toEqual(['a']);
  });
});

describe('buildPush(outbox, rows)', () => {
  const rows: LocalRow[] = [
    { table: 'tasks', row: { id: 't1', title: 'Задача', createdAt: 1, updatedAt: 100, updatedBy: B } },
    { table: 'tasks', row: { id: 't2', createdAt: 2, updatedAt: 150, deletedAt: 150 } },
    { table: 'settings', row: { key: 'time.pomodoro', value: { focusMin: 25 } } },
    { table: 'settings', row: { key: 'device.id', value: 'device-a' } },
  ];

  it('живая строка уходит с содержимым, без служебных полей; updatedBy — это устройство', () => {
    expect(buildPush([entry('tasks', 't1', 101)], rows, { deviceId: A })).toEqual([
      { table: 'tasks', key: 't1', updatedAt: 100, updatedBy: A, data: { title: 'Задача', createdAt: 1 } },
    ]);
  });

  it('запись очереди без строки — удаление: tombstone со временем записи очереди, без содержимого', () => {
    expect(buildPush([entry('tasks', 'gone', 170)], rows, { deviceId: A })).toEqual([
      { table: 'tasks', key: 'gone', updatedAt: 170, updatedBy: A, deletedAt: 170 },
    ]);
  });

  it('tombstone от softDelete уходит как есть: ключ и времена, без содержимого', () => {
    expect(buildPush([entry('tasks', 't2', 151)], rows, { deviceId: A })).toEqual([
      { table: 'tasks', key: 't2', updatedAt: 150, updatedBy: A, deletedAt: 150 },
    ]);
  });

  it('настройка без updatedAt берёт время из записи очереди; ключ — key', () => {
    expect(buildPush([entry('settings', 'time.pomodoro', 180)], rows, { deviceId: A })).toEqual([
      { table: 'settings', key: 'time.pomodoro', updatedAt: 180, updatedBy: A, data: { value: { focusMin: 25 } } },
    ]);
  });

  it('состояние устройства (ключи localOnly) не отправляется, даже если оказалось в очереди', () => {
    expect(buildPush([entry('settings', 'device.id', 190)], rows, { deviceId: A })).toEqual([]);
  });

  it('очередь отправляется от старых изменений к новым', () => {
    const outbox = [entry('tasks', 't2', 300), entry('settings', 'time.pomodoro', 100), entry('tasks', 't1', 200)];
    expect(buildPush(outbox, rows, { deviceId: A }).map((c) => c.key)).toEqual(['time.pomodoro', 't1', 't2']);
  });
});

describe('applyPull(changes, local)', () => {
  const local = (rows: LocalRow[] = [], outbox: SyncOutboxEntry[] = []) => ({ rows, outbox, deviceId: A });
  const task = (patch: Record<string, unknown> = {}): LocalRow => ({
    table: 'tasks',
    row: { id: 't1', title: 'Локальная', createdAt: 1, updatedAt: 100, ...patch },
  });

  it('строка без локальных правок заменяется серверной; курсор — наибольший rev', () => {
    const remote = pulled(7, { updatedAt: 50, updatedBy: B, data: { title: 'С сервера', createdAt: 1 } });
    expect(applyPull([pulled(3, { key: 't0' }), remote], local([task()]))).toEqual({
      put: [
        { table: 'tasks', row: { id: 't0', title: 'Задача', createdAt: 1, updatedAt: 100, updatedBy: A } },
        { table: 'tasks', row: { id: 't1', title: 'С сервера', createdAt: 1, updatedAt: 50, updatedBy: B } },
      ],
      remove: [],
      settled: [],
      conflicts: [],
      cursor: 7,
    });
  });

  it('tombstone с сервера удаляет запись на устройстве', () => {
    const plan = applyPull([{ ...tombstone({ updatedAt: 200, updatedBy: B }), rev: 4 }], local([task()]));
    expect(plan).toMatchObject({ put: [], remove: [{ table: 'tasks', key: 't1' }], cursor: 4 });
  });

  it('эхо собственного удаления не трогает локальный tombstone; неизвестный ключ с tombstone — ничего не делать', () => {
    const mine = task({ updatedAt: 200, deletedAt: 200, title: undefined });
    const echo = { ...tombstone({ updatedAt: 200, updatedBy: A }), rev: 4 };
    const unknown = { ...tombstone({ key: 'never-seen', updatedAt: 200, updatedBy: B }), rev: 5 };
    expect(applyPull([echo, unknown], local([mine]))).toEqual({
      put: [],
      remove: [],
      settled: [],
      conflicts: [],
      cursor: 5,
    });
  });

  it('локальная правка в очереди позже серверной — остаётся и ждёт отправки', () => {
    const plan = applyPull(
      [pulled(5, { updatedAt: 50, updatedBy: B })],
      local([task({ updatedAt: 100 })], [entry('tasks', 't1', 100)]),
    );
    expect(plan).toEqual({ put: [], remove: [], settled: [], conflicts: [], cursor: 5 });
  });

  it('серверная запись позже локальной правки — заменяет её, правка уходит из очереди и попадает в конфликты', () => {
    const queued = entry('tasks', 't1', 100);
    const remote = pulled(5, { updatedAt: 200, updatedBy: B, data: { title: 'С сервера', createdAt: 1 } });
    const plan = applyPull([remote], local([task()], [queued]));
    expect(plan.put).toEqual([
      { table: 'tasks', row: { id: 't1', title: 'С сервера', createdAt: 1, updatedAt: 200, updatedBy: B } },
    ]);
    expect(plan.settled).toEqual([queued]);
    expect(plan.conflicts).toEqual([
      {
        local: { table: 'tasks', key: 't1', updatedAt: 100, updatedBy: A, data: { title: 'Локальная', createdAt: 1 } },
        remote,
      },
    ]);
  });

  it('эхо собственной отправки (та же версия) снимает запись очереди без конфликта', () => {
    const queued = entry('tasks', 't1', 100);
    const plan = applyPull([pulled(5, { updatedAt: 100, updatedBy: A })], local([task()], [queued]));
    expect(plan.settled).toEqual([queued]);
    expect(plan.conflicts).toEqual([]);
  });

  it('локальное удаление (запись очереди без строки) против более поздней серверной правки — запись возвращается', () => {
    const queued = entry('tasks', 't1', 100);
    const plan = applyPull([pulled(5, { updatedAt: 200, updatedBy: B })], local([], [queued]));
    expect(plan.put).toHaveLength(1);
    expect(plan.settled).toEqual([queued]);
    expect(plan.conflicts[0].local).toEqual({
      table: 'tasks',
      key: 't1',
      updatedAt: 100,
      updatedBy: A,
      deletedAt: 100,
    });
  });

  it('слитый приём пищи записывается на устройство и остаётся в очереди на отправку', () => {
    const mine = meal(100, A, [item('a', 100)]);
    const row: LocalRow = {
      table: 'mealLogs',
      row: { id: mine.key, ...mine.data, updatedAt: 100 },
    };
    const plan = applyPull(
      [{ ...meal(200, B, [item('b', 200)]), rev: 9 }],
      local([row], [entry('mealLogs', mine.key, 100)]),
    );
    expect(plan.put).toEqual([
      {
        table: 'mealLogs',
        row: {
          id: mine.key,
          date: '2026-11-05',
          kind: 'lunch',
          time: 1,
          createdAt: 1,
          items: [item('b', 200), item('a', 100)],
          updatedAt: 201,
          updatedBy: A,
        },
      },
    ]);
    expect(plan.settled).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it('состояние устройства с сервера не применяется никогда', () => {
    const remote = pulled(2, { table: 'settings', key: 'device.id', data: { value: 'чужой' } });
    expect(applyPull([remote], local())).toMatchObject({ put: [], remove: [], cursor: 2 });
  });

  it('настройка с сервера получает ключ key и время изменения', () => {
    const remote = pulled(2, { table: 'settings', key: 'time.pomodoro', updatedBy: B, data: { value: 1 } });
    expect(applyPull([remote], local()).put).toEqual([
      { table: 'settings', row: { key: 'time.pomodoro', value: 1, updatedAt: 100, updatedBy: B } },
    ]);
  });

  it('несколько изменений одной строки в одной пачке — действует последнее по rev', () => {
    const plan = applyPull(
      [
        pulled(8, { updatedAt: 300, data: { title: 'Вторая' } }),
        pulled(6, { updatedAt: 200, data: { title: 'Первая' } }),
      ],
      local(),
    );
    expect(plan.put.map((p) => p.row.title)).toEqual(['Вторая']);
    const removed = applyPull([pulled(6), { ...tombstone({ updatedAt: 300 }), rev: 8 }], local([task()]));
    expect(removed).toMatchObject({ put: [], remove: [{ table: 'tasks', key: 't1' }] });
  });

  it('пустая пачка не двигает курсор', () => {
    expect(applyPull([], local()).cursor).toBe(0);
  });
});

describe('applyPushResult(results, local) — ответ сервера на отправку', () => {
  const queued = entry('tasks', 't1', 100);
  const local = {
    rows: [{ table: 'tasks', row: { id: 't1', title: 'Локальная', createdAt: 1, updatedAt: 100 } }],
    outbox: [queued, entry('tasks', 't9', 120)],
    deviceId: A,
  };

  it('принятое изменение уходит из очереди; неотправленное остаётся', () => {
    const plan = applyPushResult([{ table: 'tasks', key: 't1', rev: 3, updatedAt: 100, applied: true }], local);
    expect(plan).toEqual({ put: [], remove: [], settled: [queued], conflicts: [] });
  });

  it('сервер отклонил изменение (у него запись позже) — его версия применяется по тем же правилам, что и pull', () => {
    const current = pulled(8, { updatedAt: 500, updatedBy: B, data: { title: 'С сервера', createdAt: 1 } });
    const plan = applyPushResult(
      [{ table: 'tasks', key: 't1', rev: 8, updatedAt: 500, applied: false, current }],
      local,
    );
    expect(plan.put).toEqual([
      { table: 'tasks', row: { id: 't1', title: 'С сервера', createdAt: 1, updatedAt: 500, updatedBy: B } },
    ]);
    expect(plan.settled).toEqual([queued]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan).not.toHaveProperty('cursor');
  });
});

describe('устройство после долгого офлайна и замена данных в облаке', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('полная синхронизация нужна, когда устройство не синхронизировалось дольше срока жизни tombstone (90 дней)', () => {
    expect(TOMBSTONE_TTL_MS).toBe(90 * DAY);
    expect(isFullSyncDue(0, 90 * DAY)).toBe(false);
    expect(isFullSyncDue(0, 90 * DAY + 1)).toBe(true);
    expect(isFullSyncDue(undefined, 1000 * DAY)).toBe(false);
  });

  it('после полного pull лишние — локальные строки, которых нет ни на сервере, ни в очереди (кроме состояния устройства)', () => {
    const rows: LocalRow[] = [
      { table: 'tasks', row: { id: 'on-server', updatedAt: 1 } },
      { table: 'tasks', row: { id: 'deleted-elsewhere', updatedAt: 1 } },
      { table: 'tasks', row: { id: 'queued', updatedAt: 1 } },
      { table: 'tasks', row: { id: 'old-tombstone', updatedAt: 1, deletedAt: 1 } },
      { table: 'settings', row: { key: 'device.id', value: A } },
      { table: 'settings', row: { key: 'time.pomodoro', value: 1 } },
    ];
    const server = [change({ key: 'on-server' }), change({ table: 'notes', key: 'deleted-elsewhere' })];
    expect(staleAfterFullPull(server, { rows, outbox: [entry('tasks', 'queued', 5)], deviceId: A })).toEqual([
      { table: 'tasks', key: 'deleted-elsewhere' },
      { table: 'tasks', key: 'old-tombstone' },
      { table: 'settings', key: 'time.pomodoro' },
    ]);
  });

  it('замена данных в облаке: все строки устройства отправляются, записи сервера, которых на устройстве нет, получают tombstone', () => {
    const rows: LocalRow[] = [
      { table: 'tasks', row: { id: 'kept', title: 'Из копии', createdAt: 1, updatedAt: 10 } },
      { table: 'settings', row: { key: 'time.pomodoro', value: 1 } },
      { table: 'settings', row: { key: 'device.id', value: A } },
      { table: 'tasks', row: { id: 'deleted-here', updatedAt: 20, deletedAt: 20 } },
    ];
    const server = [
      change({ key: 'kept', updatedAt: 500, updatedBy: B }),
      change({ key: 'only-on-server', updatedBy: B }),
      tombstone({ key: 'already-deleted', updatedBy: B }),
      change({ key: 'deleted-here', updatedBy: B }),
      change({ table: 'settings', key: 'device.id', updatedBy: B }),
    ];
    expect(buildReplace(server, rows, { deviceId: A, now: 1000 })).toEqual([
      { table: 'tasks', key: 'kept', updatedAt: 10, updatedBy: A, data: { title: 'Из копии', createdAt: 1 } },
      { table: 'settings', key: 'time.pomodoro', updatedAt: 1000, updatedBy: A, data: { value: 1 } },
      { table: 'tasks', key: 'deleted-here', updatedAt: 20, updatedBy: A, deletedAt: 20 },
      { table: 'tasks', key: 'only-on-server', updatedAt: 1000, updatedBy: A, deletedAt: 1000 },
    ]);
  });
});
