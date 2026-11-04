import { beforeEach, describe, expect, it } from 'vitest';
import { exportAll, importAll } from './backup';
import { db, TABLE_NAMES } from './db';
import { newRecord } from './ids';

beforeEach(async () => {
  await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
});

describe('backup', () => {
  it('export → clear → import restores all data', async () => {
    await db.tasks.add(newRecord({ title: 'Прочитать статью', priority: 2 as const, tags: ['учёба'] }));
    await db.habits.add(newRecord({ name: 'Медитация', schedule: { kind: 'daily' as const }, archived: false }));
    await db.settings.put({ key: 'theme', value: 'dark' });

    const backup = JSON.parse(JSON.stringify(await exportAll()));
    await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
    expect(await db.tasks.count()).toBe(0);

    await importAll(backup);
    expect((await db.tasks.toArray())[0].title).toBe('Прочитать статью');
    expect(await db.habits.count()).toBe(1);
    expect((await db.settings.get('theme'))?.value).toBe('dark');
  });

  it('Given модуль time сохраняет настройки Pomodoro в settings под ключом time.pomodoro When экспорт JSON Then они попадают в копию и восстанавливаются', async () => {
    const pomodoro = { workMin: 50, shortBreakMin: 10, longBreakMin: 20, sessionsBeforeLongBreak: 4 };
    await db.settings.put({ key: 'time.pomodoro', value: pomodoro });

    const backup = JSON.parse(JSON.stringify(await exportAll()));
    expect(backup.tables.settings).toContainEqual({ key: 'time.pomodoro', value: pomodoro });

    await db.settings.clear();
    await importAll(backup);
    expect((await db.settings.get('time.pomodoro'))?.value).toEqual(pomodoro);
  });

  it('rejects files that are not a backup', async () => {
    await expect(importAll({ hello: 'world' })).rejects.toThrow();
  });

  it('rejects backups from a newer app version', async () => {
    const backup = await exportAll();
    await expect(importAll({ ...backup, version: 999 })).rejects.toThrow();
  });
});
