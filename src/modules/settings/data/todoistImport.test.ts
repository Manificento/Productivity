import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { parseTodoistCsv, type TodoistPreview } from '../logic/todoistCsv';
import { countCompletedInApp, importTodoist } from './todoistImport';

const CSV = [
  'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG',
  'task,Первая,,4,1,,,,,,,,,',
  'task,Вторая,,4,1,,,,,,,,,',
  'task,Третья,,4,1,,,,,,,,,',
].join('\n');

function preview(): TodoistPreview {
  const r = parseTodoistCsv(CSV, 'Дом.csv');
  if (!r.ok) throw new Error(r.error);
  return r.preview;
}

beforeEach(async () => {
  await Promise.all([db.tasks.clear(), db.projects.clear()]);
});

describe('Todoist import: tasks already completed in LifeOS', () => {
  it('counts the file’s tasks that are completed in LifeOS; a new file counts none', async () => {
    expect(await countCompletedInApp(preview())).toBe(0);
    await importTodoist(preview());
    const [first, second] = await db.tasks.toArray();
    await db.tasks.update(first.id, { completedAt: 1 });
    await db.tasks.update(second.id, { completedAt: 2 });
    expect(await countCompletedInApp(preview())).toBe(2);
  });

  it('ignores tasks from another source and completed tasks that are not in the file', async () => {
    await importTodoist(preview());
    await db.tasks.toCollection().modify({ source: 'other', completedAt: 1 });
    await db.tasks.add({
      id: 'x',
      createdAt: 0,
      updatedAt: 0,
      title: 'Чужая',
      priority: 4,
      tags: [],
      source: 'todoist',
      externalId: 'not-in-file',
      completedAt: 1,
    });
    expect(await countCompletedInApp(preview())).toBe(0);
  });
});
