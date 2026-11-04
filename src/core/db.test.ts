import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { LifeDB } from './db';

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
