import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { addProject, renameProject, setProjectArchived } from './projects';

beforeEach(async () => {
  await db.projects.clear();
});

describe('projects data', () => {
  it('creates, renames and archives a project', async () => {
    const id = await addProject(' Учёба ', 1000);
    expect(await db.projects.get(id)).toMatchObject({ name: 'Учёба', archived: false, createdAt: 1000 });

    await renameProject(id, 'Университет', 2000);
    expect(await db.projects.get(id)).toMatchObject({ name: 'Университет', updatedAt: 2000 });

    await setProjectArchived(id, true, 3000);
    expect(await db.projects.get(id)).toMatchObject({ archived: true, updatedAt: 3000 });
  });

  it('refuses a duplicate or empty name', async () => {
    const id = await addProject('Учёба');
    await expect(addProject('учёба')).rejects.toThrow('Такой проект уже есть');
    await expect(renameProject(id, ' ')).rejects.toThrow('Введите название проекта');
    expect(await db.projects.count()).toBe(1);
  });

  it('refuses to restore an archived project whose name is taken', async () => {
    const old = await addProject('Учёба');
    await setProjectArchived(old, true);
    await addProject('учёба');
    await expect(setProjectArchived(old, false)).rejects.toThrow('Такой проект уже есть');
    expect((await db.projects.get(old))?.archived).toBe(true);
  });

  it('ignores a missing project', async () => {
    await expect(setProjectArchived('nope', true)).resolves.toBeUndefined();
  });
});
