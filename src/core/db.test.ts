import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { LifeDB, TABLE_NAMES } from './db';

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
  it('Given БД версии 2 с данными When приложение обновляется Then данные сохранены; появились таблицы weightLogs, programs, plannedSessions, meditationSessions, mindSessions, notes, xpEvents — Dexie v3', async () => {
    const name = `migration-v2-${Math.random()}`;
    const v2 = new Dexie(name);
    v2.version(1).stores({ tasks: 'id, projectId, dueDate, priority, completedAt, *tags' });
    v2.version(2).stores({ cognitiveTests: 'id, date, kind, [kind+date]' });
    await v2.table('tasks').add({ id: 't1', title: 'старая задача', priority: 4, tags: [] });
    await v2.table('cognitiveTests').add({ id: 'c1', date: '2026-11-04', kind: 'pvt' });
    v2.close();

    const db = new LifeDB(name);
    expect(db.verno).toBe(3);
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
