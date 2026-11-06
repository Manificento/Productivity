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

describe('backup of the SPEC 0.3 tables (contract C3)', () => {
  it('Given записи в weightLogs, notes и xpEvents When экспорт → очистка → импорт Then они восстановлены', async () => {
    await db.weightLogs.add(newRecord({ date: '2026-11-04', kg: 72.4 }));
    await db.notes.add(newRecord({ title: 'План', body: '# План', linkIds: ['2026-11-04'] }));
    await db.xpEvents.add(newRecord({ date: '2026-11-04', source: 'quest' as const, questId: 'q1', amount: 10 }));

    const backup = JSON.parse(JSON.stringify(await exportAll()));
    expect(backup.tables.weightLogs).toHaveLength(1);
    expect(Object.keys(backup.tables).sort()).toEqual([...TABLE_NAMES].sort());

    await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()));
    await importAll(backup);
    expect((await db.weightLogs.toArray())[0].kg).toBe(72.4);
    expect((await db.notes.toArray())[0].title).toBe('План');
    expect((await db.xpEvents.toArray())[0].amount).toBe(10);
  });

  it('Given резервная копия со старыми записями When она импортируется Then записи без externalId читаются как раньше', async () => {
    const old = { id: 'w-old', createdAt: 0, updatedAt: 0, date: '2026-10-01', type: 'Бег', durationMin: 30, rpe: 6 };
    const imported = { ...old, id: 'w-new', sourceId: 'com.strava', externalId: 'hk-1' };
    const backup = await exportAll();
    await importAll({ ...backup, tables: { ...backup.tables, workoutLogs: [old, imported] } });
    expect(await db.workoutLogs.get('w-old')).toEqual(old);
    expect(await db.workoutLogs.where('[sourceId+externalId]').equals(['com.strava', 'hk-1']).count()).toBe(1);
  });
});
