import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { LifeDB, TABLE_NAMES } from './db';
import type { BaseRecord, Setting } from './types';

describe('database migrations', () => {
  it('upgrading from v1 keeps existing data and adds cognitiveTests', async () => {
    const name = `migration-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ tasks: 'id, projectId, dueDate, priority, completedAt, *tags' });
    await v1.table('tasks').add({ id: 't1', title: 'старая задача', priority: 4, tags: [] });
    v1.close();

    const db = new LifeDB(name);
    expect((await db.tasks.get('t1'))?.title).toBe('старая задача');
    await db.cognitiveTests.add({
      id: 'c1',
      createdAt: 0,
      updatedAt: 0,
      date: '2026-11-05',
      kind: 'pvt',
      startedAt: 0,
      durationMs: 60_000,
      reactionTimesMs: [250, 300],
      lapses: 0,
      falseStarts: 0,
      medianRtMs: 275,
    });
    expect(await db.cognitiveTests.where('[kind+date]').equals(['pvt', '2026-11-05']).count()).toBe(1);
    db.close();
  });
});

describe('contract C3: tables of the SPEC 0.3 blocks', () => {
  it('Given БД версии 2 с данными When приложение обновляется Then данные сохранены; появились таблицы weightLogs (&date), programs, plannedSessions (&[programId+date], date), meditationSessions, mindSessions, notes, xpEvents — Dexie v3', async () => {
    const name = `migration-v2-${Math.random()}`;
    const v2 = new Dexie(name);
    v2.version(1).stores({ tasks: 'id, projectId, dueDate, priority, completedAt, *tags' });
    v2.version(2).stores({ cognitiveTests: 'id, date, kind, [kind+date]' });
    await v2.table('tasks').add({ id: 't1', title: 'старая задача', priority: 4, tags: [] });
    await v2.table('cognitiveTests').add({ id: 'c1', date: '2026-11-04', kind: 'pvt' });
    v2.close();

    const db = new LifeDB(name);
    expect(db.verno).toBeGreaterThanOrEqual(3);
    expect((await db.tasks.get('t1'))?.title).toBe('старая задача');
    expect((await db.cognitiveTests.get('c1'))?.kind).toBe('pvt');

    const base = { createdAt: 0, updatedAt: 0 };
    await db.weightLogs.add({ id: 'w1', ...base, date: '2026-11-04', kg: 72.4 });
    await db.programs.add({ id: 'p1', ...base, name: 'База', archived: false, weeks: 4, days: [] });
    await db.plannedSessions.add({
      id: 's1',
      ...base,
      programId: 'p1',
      date: '2026-11-04',
      exercises: [{ name: 'Присед', sets: 3, reps: 5 }],
      status: 'planned',
    });
    await db.meditationSessions.add({
      id: 'm1',
      ...base,
      date: '2026-11-04',
      startedAt: 0,
      durationMin: 10,
      kind: 'breathing',
      pattern: '4-7-8',
      completed: true,
    });
    await db.mindSessions.add({
      id: 'n1',
      ...base,
      date: '2026-11-04',
      kind: 'nback',
      durationMs: 120_000,
      accuracyPct: 80,
      level: 2,
    });
    await db.notes.add({ id: 'o1', ...base, title: 'План', body: '# План', linkIds: ['p1', '2026-11-04'] });
    await db.xpEvents.add({ id: 'x1', ...base, date: '2026-11-04', source: 'quest', questId: 'q1', amount: 10 });

    // The indexes the blocks query by.
    expect(await db.weightLogs.where('date').equals('2026-11-04').count()).toBe(1);
    await expect(db.weightLogs.add({ id: 'w2', ...base, date: '2026-11-04', kg: 70 })).rejects.toThrow(); // &date
    expect(await db.plannedSessions.where('[programId+date]').equals(['p1', '2026-11-04']).count()).toBe(1);
    expect(await db.plannedSessions.where('date').equals('2026-11-04').count()).toBe(1);
    await expect(
      db.plannedSessions.add({
        id: 's2',
        ...base,
        programId: 'p1',
        date: '2026-11-04',
        exercises: [],
        status: 'planned',
      }),
    ).rejects.toThrow(); // &[programId+date]: one session of a program per day
    expect(await db.meditationSessions.where('date').equals('2026-11-04').count()).toBe(1);
    expect(await db.mindSessions.where('kind').equals('nback').count()).toBe(1);
    expect(await db.mindSessions.where('date').equals('2026-11-04').count()).toBe(1);
    expect(await db.notes.where('linkIds').equals('2026-11-04').count()).toBe(1); // *linkIds
    expect(await db.notes.orderBy('updatedAt').count()).toBe(1);
    expect(await db.xpEvents.where('source').equals('quest').count()).toBe(1);
    expect(await db.xpEvents.where('date').equals('2026-11-04').count()).toBe(1);
    db.close();
  });

  it('TABLE_NAMES includes the new tables, so the backup covers them', () => {
    for (const t of [
      'weightLogs',
      'programs',
      'plannedSessions',
      'meditationSessions',
      'mindSessions',
      'notes',
      'xpEvents',
    ]) {
      expect(TABLE_NAMES).toContain(t);
    }
  });
});

describe('contract: imported tasks (Dexie v4)', () => {
  it('Given задача с теми же source и externalId When ищем её Then индекс [source+externalId] есть; поля Task.source? и Task.externalId? необязательны', async () => {
    const name = `migration-v4-${Math.random()}`;
    const v3 = new Dexie(name);
    v3.version(1).stores({ tasks: 'id, projectId, dueDate, priority, completedAt, *tags', projects: 'id, archived' });
    v3.version(2).stores({ cognitiveTests: 'id, date, kind, [kind+date]' });
    v3.version(3).stores({ weightLogs: 'id, &date' });
    await v3.table('tasks').add({ id: 't1', title: 'старая задача', priority: 4, tags: [] });
    await v3.table('projects').add({ id: 'p1', name: 'Дом', archived: false });
    await v3.table('weightLogs').add({ id: 'w1', date: '2026-11-04', kg: 70 });
    v3.close();

    const db = new LifeDB(name);
    expect(db.verno).toBeGreaterThanOrEqual(4);
    expect((await db.tasks.get('t1'))?.title).toBe('старая задача');
    expect((await db.projects.get('p1'))?.name).toBe('Дом');
    expect((await db.weightLogs.get('w1'))?.kg).toBe(70);
    await db.tasks.add({
      id: 't2',
      createdAt: 0,
      updatedAt: 0,
      title: 'из Todoist',
      priority: 2,
      tags: [],
      source: 'todoist',
      externalId: '1001',
    });
    expect(await db.tasks.where('[source+externalId]').equals(['todoist', '1001']).count()).toBe(1);
    expect(await db.tasks.where('[source+externalId]').equals(['other', '1001']).count()).toBe(0);
    db.close();
  });
});

describe('contract: imported workouts (Dexie v5)', () => {
  it('Given тренировки из старой базы When база открывается Then они читаются как раньше, а у новых есть индекс [sourceId+externalId]', async () => {
    const name = `migration-v5-${Math.random()}`;
    const v4 = new Dexie(name);
    v4.version(1).stores({ workoutLogs: 'id, date', tasks: 'id, projectId, dueDate, priority, completedAt, *tags' });
    v4.version(4).stores({ tasks: 'id, projectId, dueDate, priority, completedAt, *tags, [source+externalId]' });
    await v4.table('workoutLogs').add({ id: 'w1', date: '2026-11-04', type: 'Бег', durationMin: 30, rpe: 6 });
    v4.close();

    const db = new LifeDB(name);
    expect(db.verno).toBeGreaterThanOrEqual(5);
    expect((await db.workoutLogs.get('w1'))?.type).toBe('Бег');
    await db.workoutLogs.add({
      id: 'w2',
      createdAt: 0,
      updatedAt: 0,
      date: '2026-11-05',
      type: 'Бег',
      durationMin: 30,
      rpe: 6,
      sourceId: 'com.strava',
      externalId: 'hc-1',
    });
    expect(await db.workoutLogs.where('[sourceId+externalId]').equals(['com.strava', 'hc-1']).count()).toBe(1);
    expect(await db.workoutLogs.where('[sourceId+externalId]').equals(['com.other', 'hc-1']).count()).toBe(0);
    db.close();
  });
});

describe('contract: imported sleep (Dexie v6)', () => {
  it('Given ночи из старой базы When база открывается Then они читаются как раньше, а у новых есть индекс [sourceId+externalId]', async () => {
    const name = `migration-v6-${Math.random()}`;
    const v5 = new Dexie(name);
    v5.version(1).stores({ sleepLogs: 'id, &date' });
    v5.version(5).stores({ workoutLogs: 'id, date, [sourceId+externalId]' });
    await v5.table('sleepLogs').add({ id: 's1', date: '2026-11-04', bedtime: 1, wakeTime: 2, quality: 4 });
    v5.close();

    const db = new LifeDB(name);
    expect(db.verno).toBeGreaterThanOrEqual(6);
    expect((await db.sleepLogs.get('s1'))?.quality).toBe(4);
    await db.sleepLogs.add({
      id: 's2',
      createdAt: 0,
      updatedAt: 0,
      date: '2026-11-05',
      bedtime: 1,
      wakeTime: 2,
      quality: 3,
      sourceId: 'com.northcube.sleepcycle',
      externalId: 'sc-1',
    });
    expect(await db.sleepLogs.where('[sourceId+externalId]').equals(['com.northcube.sleepcycle', 'sc-1']).count()).toBe(
      1,
    );
    db.close();
  });
});

describe('contract #274: записи под синхронизацию', () => {
  it('Given src/core/types.ts When читаю BaseRecord Then добавлены необязательные deletedAt?: Millis и updatedBy?: string (deviceId); Setting получает updatedAt; существующие записи читаются без миграции данных', async () => {
    // The new fields are optional: a record written before the contract is still a valid BaseRecord / Setting…
    const before: BaseRecord = { id: 't1', createdAt: 1, updatedAt: 2 };
    const oldSetting: Setting = { key: 'theme', value: 'dark' };
    // …and a synced one carries the tombstone mark, the device that wrote it and (settings) the write time.
    const synced: BaseRecord = { ...before, deletedAt: 3, updatedBy: 'device-1' };
    const newSetting: Setting = { ...oldSetting, updatedAt: 4 };
    expect(synced.deletedAt).toBe(3);
    expect(synced.updatedBy).toBe('device-1');
    expect(newSetting.updatedAt).toBe(4);

    const name = `migration-v7-${Math.random()}`;
    const v6 = new Dexie(name);
    v6.version(1).stores({ tasks: 'id, projectId, dueDate, priority, completedAt, *tags', settings: 'key' });
    v6.version(6).stores({ sleepLogs: 'id, &date, [sourceId+externalId]' });
    const task = { ...before, title: 'старая задача', priority: 4, tags: [] };
    const night = { id: 's1', createdAt: 1, updatedAt: 2, date: '2026-11-04', bedtime: 1, wakeTime: 2, quality: 4 };
    await v6.table('tasks').add(task);
    await v6.table('sleepLogs').add(night);
    await v6.table('settings').add(oldSetting);
    v6.close();

    const db = new LifeDB(name);
    // No data migration: the rows are exactly what the old version stored.
    expect(await db.tasks.get('t1')).toEqual(task);
    expect(await db.tasks.toArray()).toEqual([task]);
    expect(await db.sleepLogs.where('date').equals('2026-11-04').first()).toEqual(night);
    expect(await db.settings.get('theme')).toEqual(oldSetting);
    db.close();
  });
});
