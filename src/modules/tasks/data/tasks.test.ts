import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { addQuickTask, addTask, deleteTask, toggleTask } from './tasks';

beforeEach(async () => {
  await Promise.all([db.tasks.clear(), db.projects.clear()]);
});

describe('tasks data', () => {
  it('addTask stores a trimmed inbox task with priority 4', async () => {
    const id = await addTask({ title: '  Купить молоко ' }, 1000);
    const saved = await db.tasks.get(id);
    expect(saved).toMatchObject({ title: 'Купить молоко', priority: 4, tags: [], createdAt: 1000, updatedAt: 1000 });
    expect(saved?.dueDate).toBeUndefined();
    expect(saved?.completedAt).toBeUndefined();
  });

  it('addTask keeps the due date and project of the draft', async () => {
    const id = await addTask({ title: 'Конспект', dueDate: '2026-11-04', projectId: 'study' });
    expect(await db.tasks.get(id)).toMatchObject({ dueDate: '2026-11-04', projectId: 'study', priority: 4 });
  });

  it('addTask rejects an empty title', async () => {
    await expect(addTask({ title: '  ' })).rejects.toThrow('Введите название задачи');
    expect(await db.tasks.count()).toBe(0);
  });

  it('toggleTask sets completedAt, then clears it again', async () => {
    const id = await addTask({ title: 'Купить молоко' }, 1000);
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
    const id = await addTask({ title: 'Купить молоко' });
    await deleteTask(id);
    expect(await db.tasks.get(id)).toBeUndefined();
  });

  it('Given проекта «учёба» нет When я сохраняю задачу Then проект создаётся (сравнение без учёта регистра), задача привязана к нему', async () => {
    const id = await addQuickTask({ title: 'конспект', projectName: 'учёба', priority: 1, tags: [] }, 1000);
    const [project] = await db.projects.toArray();
    expect(project).toMatchObject({ name: 'учёба', archived: false });
    expect(await db.tasks.get(id)).toMatchObject({ title: 'конспект', projectId: project.id, priority: 1 });
    expect(await db.tasks.get(id)).not.toHaveProperty('projectName');
  });

  it('Given проект «Учёба» уже есть When я пишу «#учёба» Then новый проект не создаётся', async () => {
    await db.projects.add({ id: 'study', name: 'Учёба', archived: false, createdAt: 0, updatedAt: 0 });
    const id = await addQuickTask({ title: 'конспект', projectName: 'учёба', priority: 4, tags: [] });
    expect(await db.projects.count()).toBe(1);
    expect((await db.tasks.get(id))?.projectId).toBe('study');
  });

  it('addQuickTask without a project keeps the default project and creates none', async () => {
    const id = await addQuickTask({ title: 'конспект', projectId: 'p', priority: 4, tags: [] });
    expect((await db.tasks.get(id))?.projectId).toBe('p');
    expect(await db.projects.count()).toBe(0);
  });

  it('addQuickTask with an empty title creates nothing', async () => {
    await expect(addQuickTask({ title: ' ', projectName: 'учёба', priority: 4, tags: [] })).rejects.toThrow();
    expect(await db.projects.count()).toBe(0);
  });
});
