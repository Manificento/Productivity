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

  describe('repeating tasks', () => {
    // 2026-11-04 12:00 local time.
    const DONE_AT = new Date(2026, 10, 4, 12, 0).getTime();

    async function addDaily() {
      return addTask(
        { title: 'зарядка', dueDate: '2026-11-04', projectId: 'health', priority: 2, recurrence: { kind: 'daily' } },
        1000,
      );
    }

    it('Given ежедневная задача на 2026-11-04 When я её выполняю Then создаётся копия на 2026-11-05 с тем же названием, проектом, приоритетом и повтором', async () => {
      const id = await addDaily();
      await toggleTask(id, DONE_AT);

      const copies = (await db.tasks.toArray()).filter((t) => t.id !== id);
      expect(copies).toHaveLength(1);
      expect(copies[0]).toMatchObject({
        title: 'зарядка',
        dueDate: '2026-11-05',
        projectId: 'health',
        priority: 2,
        recurrence: { kind: 'daily' },
        createdAt: DONE_AT,
      });
      expect(copies[0].completedAt).toBeUndefined();
      expect((await db.tasks.get(id))?.completedAt).toBe(DONE_AT);
    });

    it('Given я снимаю отметку с выполненной повторяющейся задачи When список обновляется Then созданная копия удаляется, если ещё не выполнена', async () => {
      const id = await addDaily();
      await toggleTask(id, DONE_AT);
      await toggleTask(id, DONE_AT + 1000);

      expect(await db.tasks.count()).toBe(1);
      expect((await db.tasks.get(id))?.completedAt).toBeUndefined();
    });

    it('reopening keeps a copy that was already completed', async () => {
      const id = await addDaily();
      await toggleTask(id, DONE_AT);
      const copy = (await db.tasks.toArray()).find((t) => t.id !== id)!;
      await toggleTask(copy.id, DONE_AT + 1000); // completes the copy, creating the 11-06 one
      await toggleTask(id, DONE_AT + 2000);

      const all = await db.tasks.toArray();
      expect(all.find((t) => t.id === copy.id)?.completedAt).toBe(DONE_AT + 1000);
      expect(all.map((t) => t.dueDate).sort()).toEqual(['2026-11-04', '2026-11-05', '2026-11-06']);
    });

    it('completing, reopening and completing again does not duplicate a kept copy', async () => {
      const id = await addDaily();
      await toggleTask(id, DONE_AT);
      const copy = (await db.tasks.toArray()).find((t) => t.id !== id)!;
      await toggleTask(copy.id, DONE_AT + 1000);
      await toggleTask(id, DONE_AT + 2000);
      await toggleTask(id, DONE_AT + 3000);

      const dates = (await db.tasks.toArray()).map((t) => t.dueDate).sort();
      expect(dates).toEqual(['2026-11-04', '2026-11-05', '2026-11-06']);
    });

    it('reopening removes the copy even after it was renamed', async () => {
      const id = await addDaily();
      await toggleTask(id, DONE_AT);
      const copy = (await db.tasks.toArray()).find((t) => t.id !== id)!;
      await db.tasks.update(copy.id, { title: 'зарядка утром' });
      await toggleTask(id, DONE_AT + 1000);
      expect(await db.tasks.count()).toBe(1);
    });

    it('Given задача «по вторникам и четвергам» на вторник When я её выполняю Then следующая копия — на ближайший четверг', async () => {
      const id = await addTask({
        title: 'бег',
        dueDate: '2026-11-03',
        recurrence: { kind: 'weekly', weekdays: [2, 4] },
      });
      await toggleTask(id, new Date(2026, 10, 3, 9, 0).getTime());
      expect((await db.tasks.toArray()).find((t) => t.id !== id)?.dueDate).toBe('2026-11-05');
    });

    it('an overdue daily task completed today gets tomorrow’s copy', async () => {
      const id = await addTask({ title: 'зарядка', dueDate: '2026-11-01', recurrence: { kind: 'daily' } });
      await toggleTask(id, DONE_AT);
      expect((await db.tasks.toArray()).find((t) => t.id !== id)?.dueDate).toBe('2026-11-05');
    });

    it('a task without a repeat creates no copy', async () => {
      const id = await addTask({ title: 'разово', dueDate: '2026-11-04' });
      await toggleTask(id, DONE_AT);
      expect(await db.tasks.count()).toBe(1);
    });
  });
});
