import Dexie from 'dexie';

/**
 * A database as Dexie v7 left it (the version before contract #275): the whole schema of that version and data
 * the way the app wrote it then — random ids in the «one per day» tables, meal items without `id`, duplicates of a
 * day, a tombstone and a few outbox entries. Migration tests open it with the current `LifeDB`.
 *
 * Never update this file to a newer schema: it is a snapshot of the past.
 */
export const V7_STORES = {
  projects: 'id, archived',
  tasks: 'id, projectId, dueDate, priority, completedAt, *tags, [source+externalId]',
  habits: 'id, archived',
  habitLogs: 'id, habitId, date, [habitId+date]',
  timeCategories: 'id, archived',
  timeEntries: 'id, categoryId, taskId, date, start',
  sleepLogs: 'id, &date, [sourceId+externalId]',
  foods: 'id, name, externalId',
  mealLogs: 'id, date',
  workoutLogs: 'id, date, [sourceId+externalId]',
  checkIns: 'id, &date',
  lifeEvents: 'id, date, projectId',
  settings: 'key',
  cognitiveTests: 'id, date, kind, [kind+date]',
  weightLogs: 'id, &date',
  programs: 'id',
  plannedSessions: 'id, &[programId+date], date',
  meditationSessions: 'id, date',
  mindSessions: 'id, date, kind',
  notes: 'id, updatedAt, *linkIds',
  xpEvents: 'id, date, source',
  syncOutbox: '[table+key], updatedAt',
};

const at = (id: string, createdAt: number, updatedAt: number = createdAt) => ({ id, createdAt, updatedAt });

const D3 = '2026-11-03';
const D4 = '2026-11-04';
const BED = new Date(2026, 10, 2, 23, 30).getTime();
const WAKE = new Date(2026, 10, 3, 7, 0).getTime();
const DAY = 86_400_000;

/** Rows of the v7 database, by table. Ids imitate `crypto.randomUUID()`. */
export const V7_ROWS = {
  settings: [
    { key: 'device.id', value: 'device-1' },
    { key: 'theme', value: 'dark' },
  ],
  tasks: [{ ...at('t-1', 10), title: 'Отчёт', priority: 2, tags: [] }],
  habits: [{ ...at('h1', 10), name: 'Зарядка', schedule: { kind: 'daily' }, archived: false }],
  foods: [
    { ...at('f1', 10), name: 'Рис', kcal: 116, protein: 2.2, fat: 0.5, carbs: 24.9, source: 'custom' },
    { ...at('f2', 10), name: 'Курица', kcal: 165, protein: 31, fat: 3.6, carbs: 0, source: 'custom' },
    { ...at('f3', 10), name: 'Яблоко', kcal: 47, protein: 0.4, fat: 0.4, carbs: 9.8, source: 'custom' },
  ],
  workoutLogs: [{ ...at('wo-1', 10), date: D3, type: 'Бег', durationMin: 30, rpe: 6 }],
  programs: [{ ...at('p-1', 10), name: 'База', archived: false, weeks: 4, days: [] }],
  plannedSessions: [
    { ...at('ps-1', 10), programId: 'p-1', date: D3, exercises: [], status: 'done', workoutLogId: 'wo-1' },
  ],
  notes: [{ ...at('n-1', 10), title: 'День', body: '', linkIds: [D3] }],

  // Three marks of one habit on one day (duplicates left by an import), one more day and one more habit.
  habitLogs: [
    { ...at('2b1f', 100), habitId: 'h1', date: D3, done: true },
    { ...at('9d4e', 100, 300), habitId: 'h1', date: D3, done: false },
    { ...at('5c7a', 200), habitId: 'h1', date: D3, done: true },
    { ...at('e1a0', 400), habitId: 'h1', date: D4, done: true },
    { ...at('77c2', 500), habitId: 'h2', date: D3, done: true },
  ],
  checkIns: [
    { ...at('c-0d3a', 600), date: D3, energy: 2, focus: 3, note: 'устал' },
    { ...at('c-41bb', 700, 750), date: D4, energy: 4, focus: 4 },
    // A row the app could not have written: it has no valid day, so it has no natural id.
    { ...at('c-broken', 800), date: 'не день', energy: 3, focus: 3 },
  ],
  sleepLogs: [
    {
      ...at('s-8a11', 900),
      date: D3,
      bedtime: BED,
      wakeTime: WAKE,
      quality: 4,
      stages: [{ start: BED, end: WAKE, stage: 'light' }],
    },
    {
      ...at('s-c3f9', 1000, 1100),
      date: D4,
      bedtime: BED + DAY,
      wakeTime: WAKE + DAY,
      quality: 3,
      sourceId: 'com.northcube.sleepcycle',
      externalId: 'sc-1',
    },
    // A night deleted in v7: a tombstone (key and times only), queued in the outbox.
    { ...at('s-dead', 50, 1200), deletedAt: 1200 },
  ],
  weightLogs: [
    { ...at('w-6e20', 1300), date: D3, kg: 72.4 },
    { ...at('w-b0c5', 1400), date: D4, kg: 72.1 },
  ],
  mealLogs: [
    // Two lunch records of one day (the app keeps one; an import could leave two) — they collapse into one id.
    {
      ...at('m-1aa0', 1500),
      date: D3,
      time: 1500,
      kind: 'lunch',
      items: [
        { foodId: 'f1', grams: 150 },
        { foodId: 'f2', grams: 120 },
      ],
    },
    { ...at('m-2bb1', 1600, 1700), date: D3, time: 1600, kind: 'lunch', items: [{ foodId: 'f3', grams: 180 }] },
    { ...at('m-3cc2', 1800), date: D3, time: 1800, kind: 'dinner', items: [{ foodId: 'f1', grams: 80 }] },
    { ...at('m-4dd3', 1900), date: D4, time: 1900, kind: 'lunch', items: [{ foodId: 'f2', grams: 100 }] },
  ],

  // What changed after the upgrade to v7 and is waiting for the first push.
  syncOutbox: [
    { table: 'tasks', key: 't-1', updatedAt: 2000 },
    { table: 'habitLogs', key: '9d4e', updatedAt: 2000 },
    { table: 'sleepLogs', key: 's-dead', updatedAt: 1200 },
    { table: 'mealLogs', key: 'm-2bb1', updatedAt: 1700 },
    { table: 'checkIns', key: 'c-41bb', updatedAt: 750 },
  ],
} satisfies Partial<Record<keyof typeof V7_STORES, object[]>>;

/** Creates the v7 database `name` with `V7_ROWS` and closes it. */
export async function createV7Database(name: string): Promise<void> {
  const v7 = new Dexie(name);
  v7.version(7).stores(V7_STORES);
  await v7.open();
  for (const [table, rows] of Object.entries(V7_ROWS)) await v7.table(table).bulkAdd(rows);
  v7.close();
}

/**
 * The same data as Dexie v6 held it — what most installations upgrade from: no `syncOutbox` store yet and no
 * tombstones (v6 deleted rows for real). Creates the database `name` and closes it.
 */
export async function createV6Database(name: string): Promise<void> {
  const { syncOutbox: _noQueueYet, ...stores } = V7_STORES;
  const { syncOutbox: _noEntries, ...rows } = V7_ROWS;
  const v6 = new Dexie(name);
  v6.version(6).stores(stores);
  await v6.open();
  for (const [table, list] of Object.entries(rows)) {
    await v6.table(table).bulkAdd(list.filter((row) => !('deletedAt' in row)));
  }
  v6.close();
}

/** What IndexedDB really holds in a table of `name` — read without the core middlewares (tombstones included). */
export async function storedRowsOf<T = Record<string, unknown>>(name: string, table: string): Promise<T[]> {
  const raw = new Dexie(name);
  await raw.open();
  try {
    return (await raw.table(table).toArray()) as T[];
  } finally {
    raw.close();
  }
}
