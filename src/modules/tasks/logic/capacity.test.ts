import { describe, expect, it } from 'vitest';
import type { Task } from '../../../core/types';
import { deferDate, deferrable, DEFAULT_ESTIMATE_MIN, focusFirst, planFor } from './capacity';

const TODAY = '2026-11-04';

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, createdAt: 0, updatedAt: 0, title: id, priority: 4, tags: [], dueDate: TODAY, ...over };
}

describe('capacity', () => {
  it('Given цели дня с taskCapacityMin 360 и задачи на сегодня с оценками 420 мин When я открываю «Сегодня» Then план 420 из 360 — перегруз', () => {
    const plan = planFor([task('a', { estimateMin: 240 }), task('b', { estimateMin: 180 })], 360);
    expect(plan).toEqual({ plannedMin: 420, capacityMin: 360, unestimated: 0, over: true });
  });

  it('Given задачи без оценки When считается план Then используется 30 мин по умолчанию', () => {
    expect(DEFAULT_ESTIMATE_MIN).toBe(30);
    expect(planFor([task('a'), task('b'), task('c', { estimateMin: 60 })], 360)).toEqual({
      plannedMin: 120,
      capacityMin: 360,
      unestimated: 2,
      over: false,
    });
  });

  it('a plan exactly at capacity is not over', () => {
    expect(planFor([task('a', { estimateMin: 360 })], 360).over).toBe(false);
  });

  it('Given focusProjectId When список отображается Then задачи фокус-проекта идут первыми, порядок внутри групп сохраняется', () => {
    const list = [task('a'), task('f1', { projectId: 'eng' }), task('b'), task('f2', { projectId: 'eng' })];
    expect(focusFirst(list, 'eng').map((t) => t.id)).toEqual(['f1', 'f2', 'a', 'b']);
    expect(focusFirst(list, undefined)).toBe(list);
  });

  it('only P3–P4 tasks of the today list can be deferred', () => {
    const list = [
      task('p1', { priority: 1 }),
      task('p2', { priority: 2 }),
      task('p3', { priority: 3 }),
      task('p4'),
      task('overdue-p4', { dueDate: '2026-11-01' }),
      task('tomorrow-p4', { dueDate: '2026-11-05' }),
      task('done-p4', { completedAt: 1 }),
    ];
    expect(deferrable(list, TODAY).map((t) => t.id)).toEqual(['overdue-p4', 'p3', 'p4']);
  });

  it('P3–P4 tasks of the focus project are not deferred', () => {
    const list = [task('eng-p3', { priority: 3, projectId: 'eng' }), task('other-p3', { priority: 3 })];
    expect(deferrable(list, TODAY, 'eng').map((t) => t.id)).toEqual(['other-p3']);
  });

  it('Given allowDeferLowPriority = true и план превышает ёмкость When я нажимаю «Перенести P3–P4» Then задачи P3–P4 на сегодня переносятся на день после активного события (или на завтра, если события нет)', () => {
    expect(deferDate(TODAY, '2026-11-07')).toBe('2026-11-08');
    expect(deferDate(TODAY, undefined)).toBe('2026-11-05');
    expect(deferDate(TODAY, TODAY)).toBe('2026-11-05'); // event today → tomorrow
    expect(deferDate(TODAY, '2026-11-03')).toBe('2026-11-05'); // recovery day → tomorrow, not today
  });
});
