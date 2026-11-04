import { afterEach, describe, expect, it } from 'vitest';
import { loadDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { db } from '../../../core/db';
import { createEvent, deleteEvent, updateEvent } from './events';

const fields = {
  title: 'IELTS',
  type: 'exam' as const,
  date: '2026-11-09',
  importance: 3 as const,
  prepDays: 7,
  projectId: 'english',
};

afterEach(async () => {
  await db.lifeEvents.clear();
});

describe('events data', () => {
  it('Given экран «События» When я создаю IELTS Then событие сохраняется в БД', async () => {
    const id = await createEvent(fields, 1000);
    expect(await db.lifeEvents.get(id)).toEqual({ ...fields, id, createdAt: 1000, updatedAt: 1000 });
  });

  it('Given событие When я редактирую его Then изменения в БД, цели дня пересчитываются', async () => {
    const id = await createEvent({ ...fields, date: '2026-12-20' }, 1000);
    expect((await loadDailyTargets('2026-11-08')).phase).toBe('normal');

    await updateEvent(id, { ...fields, date: '2026-11-09', importance: 2 }, 2000);

    const saved = await db.lifeEvents.get(id);
    expect(saved).toMatchObject({ date: '2026-11-09', importance: 2, createdAt: 1000, updatedAt: 2000 });
    const t = await loadDailyTargets('2026-11-08');
    expect(t.phase).toBe('taper');
    expect(t.activeEventId).toBe(id);
  });

  it('removes optional fields that were cleared in the form', async () => {
    const id = await createEvent({ ...fields, time: '09:00' }, 1000);
    const { projectId: _p, ...withoutProject } = fields;
    await updateEvent(id, withoutProject, 2000);
    const saved = await db.lifeEvents.get(id);
    expect(saved && 'time' in saved).toBe(false);
    expect(saved && 'projectId' in saved).toBe(false);
  });

  it('Given событие When я удаляю его Then оно удалено из БД, цели дня пересчитываются', async () => {
    const id = await createEvent(fields, 1000);
    expect((await loadDailyTargets('2026-11-08')).phase).toBe('taper');

    await deleteEvent(id);

    expect(await db.lifeEvents.get(id)).toBeUndefined();
    expect((await loadDailyTargets('2026-11-08')).phase).toBe('normal');
  });
});
