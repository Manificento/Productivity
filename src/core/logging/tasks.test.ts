import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { newRecord } from '../ids';
import { importTasks } from './tasks';

const TODOIST = { source: 'todoist' as const };
const NOW = new Date(2026, 10, 4, 10, 0).getTime();

beforeEach(async () => {
  await Promise.all([db.tasks.clear(), db.projects.clear()]);
});

describe('importTasks — the one write path for imported tasks and projects (ADR-0007)', () => {
  it('Given проекты и задачи из парсера When вызывается importTasks({ projects, tasks }, { source: todoist }) Then записи валидируются zod, создаются через newRecord() и пишутся в projects и tasks одной транзакцией', async () => {
    const result = await importTasks(
      {
        projects: [{ name: 'Английский' }, { name: 'Дом' }],
        tasks: [
          {
            title: 'Прочитать главу 3',
            projectName: 'Английский',
            priority: 'p2',
            externalId: '1001',
            tags: ['учёба'],
          },
          { title: 'Купить лампу', projectName: 'Дом', externalId: '1002', notes: 'IKEA' },
          { title: 'Без проекта', completedAt: NOW - 1 },
        ],
      },
      TODOIST,
      NOW,
    );
    expect(result).toEqual({ projects: { created: 2, reused: 0 }, tasks: { created: 3, updated: 0 } });

    const projects = await db.projects.toArray();
    expect(projects.map((p) => p.name).sort()).toEqual(['Английский', 'Дом']);
    expect(projects[0]).toMatchObject({ archived: false, createdAt: NOW, updatedAt: NOW });
    expect(projects[0].id).toMatch(/\S/);

    const tasks = await db.tasks.toArray();
    const reading = tasks.find((t) => t.title === 'Прочитать главу 3')!;
    expect(reading).toMatchObject({
      projectId: projects.find((p) => p.name === 'Английский')!.id,
      priority: 2,
      tags: ['учёба'],
      source: 'todoist',
      externalId: '1001',
      createdAt: NOW,
    });
    expect(reading.dueDate).toBeUndefined();
    expect(tasks.find((t) => t.title === 'Купить лампу')).toMatchObject({ notes: 'IKEA', priority: 4, tags: [] });
    expect(tasks.find((t) => t.title === 'Без проекта')).toMatchObject({ completedAt: NOW - 1, source: 'todoist' });
    expect(tasks.find((t) => t.title === 'Без проекта')?.projectId).toBeUndefined();
  });

  it('невалидная запись даёт ошибку с номером строки, и ничего не записано', async () => {
    await expect(
      importTasks({ projects: [{ name: 'Дом' }], tasks: [{ title: 'ок' }, { title: '   ' }] }, TODOIST, NOW),
    ).rejects.toThrow(/Задача 2: .*назван/i);
    await expect(importTasks({ projects: [{ name: 'Дом' }, { name: '' }], tasks: [] }, TODOIST, NOW)).rejects.toThrow(
      /Проект 2: .*назван/i,
    );
    await expect(
      importTasks({ projects: [], tasks: [{ title: 'ок', priority: 'p5' as never, row: 17 }] }, TODOIST, NOW),
    ).rejects.toThrow(/Задача 17: .*приоритет/i);
    expect(await db.tasks.count()).toBe(0);
    expect(await db.projects.count()).toBe(0);
  });

  it('a failure inside the transaction writes nothing (all or nothing)', async () => {
    await db.tasks.add(
      newRecord({ title: 'Старая', priority: 4 as const, tags: [], source: 'todoist', externalId: 'dup' }),
    );
    await db.tasks.add(
      newRecord({ title: 'Старая копия', priority: 4 as const, tags: [], source: 'todoist', externalId: 'dup' }),
    );
    // Two existing rows with the same key cannot be upserted unambiguously → the whole import is rolled back.
    await expect(
      importTasks({ projects: [{ name: 'Новый' }], tasks: [{ title: 'Новая', externalId: 'dup' }] }, TODOIST, NOW),
    ).rejects.toThrow();
    expect(await db.projects.count()).toBe(0);
    expect(await db.tasks.count()).toBe(2);
  });

  it('Given проект с таким же именем уже есть When идёт импорт Then задачи привязываются к существующему проекту, дубликат проекта не создаётся', async () => {
    const existing = newRecord({ name: 'английский ', archived: false }, 1);
    await db.projects.add(existing);
    const result = await importTasks(
      {
        projects: [{ name: 'Английский' }],
        tasks: [
          { title: 'Слова', projectName: 'АНГЛИЙСКИЙ' },
          { title: 'Новое', projectName: 'Спорт' },
        ],
      },
      TODOIST,
      NOW,
    );
    expect(result.projects).toEqual({ created: 1, reused: 1 });
    expect(await db.projects.count()).toBe(2);
    const tasks = await db.tasks.toArray();
    expect(tasks.find((t) => t.title === 'Слова')?.projectId).toBe(existing.id);
    expect(tasks.find((t) => t.title === 'Новое')?.projectId).toBe(
      (await db.projects.where('name').equals('Спорт').first())!.id,
    );
  });

  it('an archived project with the same name is not reused: imports go to a new active project', async () => {
    await db.projects.add(newRecord({ name: 'Дом', archived: true }, 1));
    await importTasks({ projects: [], tasks: [{ title: 'Лампа', projectName: 'Дом' }] }, TODOIST, NOW);
    const homes = await db.projects.where('name').equals('Дом').toArray();
    expect(homes.map((p) => p.archived).sort()).toEqual([false, true]);
  });

  it('Given задача с теми же source и externalId уже есть When импорт повторяется Then она обновляется, а не дублируется', async () => {
    const first = await importTasks(
      { projects: [], tasks: [{ title: 'Отчёт', externalId: '42', priority: 'p3' }] },
      TODOIST,
      NOW,
    );
    expect(first.tasks).toEqual({ created: 1, updated: 0 });
    const before = (await db.tasks.toArray())[0];

    const second = await importTasks(
      { projects: [], tasks: [{ title: 'Отчёт (правка)', externalId: '42', priority: 'p1', completedAt: NOW + 5 }] },
      TODOIST,
      NOW + 10,
    );
    expect(second.tasks).toEqual({ created: 0, updated: 1 });
    const tasks = await db.tasks.toArray();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: before.id,
      createdAt: NOW,
      updatedAt: NOW + 10,
      title: 'Отчёт (правка)',
      priority: 1,
      completedAt: NOW + 5,
    });
    // The same externalId from another source is a different task.
    await importTasks({ projects: [], tasks: [{ title: 'Другой', externalId: '42' }] }, { source: 'other' }, NOW);
    expect(await db.tasks.count()).toBe(2);
    // Tasks without externalId are appended every time (nothing to match on).
    await importTasks({ projects: [], tasks: [{ title: 'Без id' }] }, TODOIST, NOW);
    await importTasks({ projects: [], tasks: [{ title: 'Без id' }] }, TODOIST, NOW);
    expect(await db.tasks.filter((t) => t.title === 'Без id').count()).toBe(2);
  });

  it('the same externalId twice in one file is written once (last row wins)', async () => {
    await importTasks(
      {
        projects: [],
        tasks: [
          { title: 'Первый', externalId: 'x' },
          { title: 'Второй', externalId: 'x' },
        ],
      },
      TODOIST,
      NOW,
    );
    expect((await db.tasks.toArray()).map((t) => t.title)).toEqual(['Второй']);
  });

  it('Given даты и приоритеты из импорта When записываются Then срок — DateKey (не UTC), приоритет Todoist p1–p4 → Priority 1–4, время — HH:mm', async () => {
    // 00:30 local time in Asia/Almaty (UTC+5) is still the previous day in UTC.
    const dueAt = new Date(2026, 10, 10, 0, 30).getTime();
    await importTasks(
      {
        projects: [],
        tasks: [
          { title: 'С временем', dueAt, priority: 'p1' },
          { title: 'На день', dueDate: '2026-11-12', priority: 'p4' },
          { title: 'Днём и временем', dueDate: '2026-11-13', dueTime: '09:05', priority: 3 },
        ],
      },
      TODOIST,
      NOW,
    );
    const byTitle = Object.fromEntries((await db.tasks.toArray()).map((t) => [t.title, t]));
    expect(byTitle['С временем']).toMatchObject({ dueDate: '2026-11-10', dueTime: '00:30', priority: 1 });
    expect(byTitle['На день']).toMatchObject({ dueDate: '2026-11-12', priority: 4 });
    expect(byTitle['На день'].dueTime).toBeUndefined();
    expect(byTitle['Днём и временем']).toMatchObject({ dueDate: '2026-11-13', dueTime: '09:05', priority: 3 });
  });

  it('rejects a due date that is not a calendar day, a malformed time, or a time without a date', async () => {
    const bad = (task: Record<string, unknown>) =>
      importTasks({ projects: [], tasks: [{ title: 'x', ...task } as never] }, TODOIST, NOW);
    await expect(bad({ dueDate: '2026-13-01' })).rejects.toThrow(/Задача 1: .*(дн|дат)/i);
    await expect(bad({ dueDate: '2026-11-10T00:00:00Z' })).rejects.toThrow(/Задача 1: .*дат/i);
    await expect(bad({ dueDate: '2026-11-10', dueTime: '9:05' })).rejects.toThrow(/Задача 1: .*врем/i);
    await expect(bad({ dueTime: '09:05' })).rejects.toThrow(/Задача 1: .*дат/i);
    expect(await db.tasks.count()).toBe(0);
  });
});
