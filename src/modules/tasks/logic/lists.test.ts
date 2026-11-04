import { describe, expect, it } from 'vitest';
import type { Task } from '../../../core/types';
import { compareTasks, inboxList, isOverdue, projectList, todayList, upcomingGroups } from './lists';

const TODAY = '2026-11-04';

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, createdAt: 0, updatedAt: 0, title: id, priority: 4, tags: [], ...over };
}

const yesterday = task('yesterday', { dueDate: '2026-11-03' });
const today = task('today', { dueDate: '2026-11-04' });
const tomorrow = task('tomorrow', { dueDate: '2026-11-05' });
const nextWeek = task('nextWeek', { dueDate: '2026-11-11' });
const noDate = task('noDate');
const doneToday = task('doneToday', { dueDate: '2026-11-04', completedAt: 1 });
const doneNoDate = task('doneNoDate', { completedAt: 1 });
const ALL = [nextWeek, noDate, tomorrow, doneToday, today, yesterday, doneNoDate];

const ids = (list: Task[]) => list.map((t) => t.id);

describe('lists', () => {
  it('Given задачи со сроками вчера, сегодня, завтра и без срока When я открываю «Сегодня» Then вижу просроченные (с пометкой) и сегодняшние, но не завтрашние', () => {
    expect(ids(todayList(ALL, TODAY))).toEqual(['yesterday', 'today']);
    expect(isOverdue(yesterday, TODAY)).toBe(true);
    expect(isOverdue(today, TODAY)).toBe(false);
    expect(isOverdue(noDate, TODAY)).toBe(false);
    expect(isOverdue({ ...yesterday, completedAt: 1 }, TODAY)).toBe(false);
  });

  it('Given те же задачи When я открываю «Предстоящие» Then вижу будущие задачи, сгруппированные по дням', () => {
    const tomorrowLater = task('tomorrowLater', { dueDate: '2026-11-05', createdAt: 5 });
    const groups = upcomingGroups([...ALL, tomorrowLater], TODAY);
    expect(groups.map((g) => ({ date: g.date, ids: ids(g.tasks) }))).toEqual([
      { date: '2026-11-05', ids: ['tomorrow', 'tomorrowLater'] },
      { date: '2026-11-11', ids: ['nextWeek'] },
    ]);
  });

  it('Given те же задачи When я открываю «Входящие» Then вижу только задачи без срока', () => {
    expect(ids(inboxList(ALL, TODAY))).toEqual(['noDate']);
  });

  it('Given задачи разных приоритетов и времени When список отображается Then порядок: просроченные → приоритет 1…4 → время срока → дата создания', () => {
    const list = [
      task('p4-old', { dueDate: TODAY, priority: 4, createdAt: 1 }),
      task('p2-no-time', { dueDate: TODAY, priority: 2 }),
      task('p2-18:00', { dueDate: TODAY, priority: 2, dueTime: '18:00' }),
      task('overdue-p4', { dueDate: '2026-11-01', priority: 4 }),
      task('p1', { dueDate: TODAY, priority: 1, dueTime: '23:00' }),
      task('p2-09:00', { dueDate: TODAY, priority: 2, dueTime: '09:00' }),
      task('p4-new', { dueDate: TODAY, priority: 4, createdAt: 2 }),
    ];
    expect(ids([...list].sort(compareTasks(TODAY)))).toEqual([
      'overdue-p4',
      'p1',
      'p2-09:00',
      'p2-18:00',
      'p2-no-time',
      'p4-old',
      'p4-new',
    ]);
    expect(ids(todayList(list, TODAY))[0]).toBe('overdue-p4');
  });

  it('within one priority an earlier due date comes first, undated tasks last', () => {
    const list = [
      task('undated', { projectId: 'study' }),
      task('next-month-09:00', { projectId: 'study', dueDate: '2026-12-04', dueTime: '09:00' }),
      task('today-no-time', { projectId: 'study', dueDate: TODAY }),
    ];
    expect(ids(projectList(list, 'study', TODAY))).toEqual(['today-no-time', 'next-month-09:00', 'undated']);
  });

  it('Given проект «Учёба» с задачами When я выбираю его Then вижу только его задачи', () => {
    const study = [
      task('s2', { projectId: 'study', priority: 2 }),
      task('s1', { projectId: 'study', priority: 1, dueDate: '2026-11-20' }),
      task('sDone', { projectId: 'study', completedAt: 1 }),
    ];
    expect(ids(projectList([...ALL, ...study, task('other', { projectId: 'work' })], 'study', TODAY))).toEqual([
      's1',
      's2',
    ]);
  });
});
