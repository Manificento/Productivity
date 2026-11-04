import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { addTask, deleteTask, toggleTask } from './tasks';

beforeEach(async () => {
  await db.tasks.clear();
});

describe('tasks data', () => {
  it('addTask stores a trimmed inbox task with priority 4', async () => {
    const id = await addTask('  Купить молоко ', 1000);
    const saved = await db.tasks.get(id);
    expect(saved).toMatchObject({ title: 'Купить молоко', priority: 4, tags: [], createdAt: 1000, updatedAt: 1000 });
    expect(saved?.dueDate).toBeUndefined();
    expect(saved?.completedAt).toBeUndefined();
  });

  it('addTask rejects an empty title', async () => {
    await expect(addTask('  ')).rejects.toThrow('Введите название задачи');
    expect(await db.tasks.count()).toBe(0);
  });

  it('toggleTask sets completedAt, then clears it again', async () => {
    const id = await addTask('Купить молоко', 1000);
    await toggleTask(id, 2000);
    expect(await db.tasks.get(id)).toMatchObject({ completedAt: 2000, updatedAt: 2000 });
    await toggleTask(id, 3000);
    const reopened = await db.tasks.get(id);
    expect(reopened?.completedAt).toBeUndefined();
    expect(reopened?.updatedAt).toBe(3000);
  });

  it('toggleTask ignores a missing task', async () => {
    await expect(toggleTask('nope')).resolves.toBeUndefined();
  });

  it('deleteTask removes the task from the DB', async () => {
    const id = await addTask('Купить молоко');
    await deleteTask(id);
    expect(await db.tasks.get(id)).toBeUndefined();
  });
});
