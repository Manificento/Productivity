import { describe, expect, it } from 'vitest';
import type { Task } from '../../../core/types';
import { isNextCopyOf, nextDueDate, nextOccurrence } from './recurrence';

function task(over: Partial<Task>): Task {
  return { id: 't', createdAt: 0, updatedAt: 0, title: 'зарядка', priority: 2, tags: [], ...over };
}

describe('nextDueDate', () => {
  it('Given ежедневная задача на 2026-11-04 When я её выполняю Then следующая — 2026-11-05', () => {
    expect(nextDueDate({ kind: 'daily' }, '2026-11-04')).toBe('2026-11-05');
    expect(nextDueDate({ kind: 'daily' }, '2026-12-31')).toBe('2027-01-01');
  });

  it('Given задача «по вторникам и четвергам» на вторник When я её выполняю Then следующая копия — на ближайший четверг', () => {
    const tueThu = { kind: 'weekly' as const, weekdays: [2, 4] };
    expect(nextDueDate(tueThu, '2026-11-03')).toBe('2026-11-05'); // Tue → Thu
    expect(nextDueDate(tueThu, '2026-11-05')).toBe('2026-11-10'); // Thu → next Tue
    expect(nextDueDate(tueThu, '2026-11-04')).toBe('2026-11-05'); // off-schedule Wed → Thu
  });

  it('weekly without weekdays repeats in 7 days; a single weekday repeats a week later', () => {
    expect(nextDueDate({ kind: 'weekly' }, '2026-11-04')).toBe('2026-11-11');
    expect(nextDueDate({ kind: 'weekly', weekdays: [3] }, '2026-11-04')).toBe('2026-11-11');
    expect(nextDueDate({ kind: 'weekly', weekdays: [0] }, '2026-12-27')).toBe('2027-01-03');
  });

  it('Given ежемесячная задача на 31 января When я её выполняю Then следующая — на последний день февраля', () => {
    expect(nextDueDate({ kind: 'monthly' }, '2027-01-31')).toBe('2027-02-28');
    expect(nextDueDate({ kind: 'monthly' }, '2028-01-31')).toBe('2028-02-29');
    expect(nextDueDate({ kind: 'monthly' }, '2026-12-15')).toBe('2027-01-15');
  });

  it('Given задача «каждые 3 дня» When я её выполняю Then следующая — через 3 дня от срока', () => {
    expect(nextDueDate({ kind: 'everyNDays', interval: 3 }, '2026-11-29')).toBe('2026-12-02');
    expect(nextDueDate({ kind: 'everyNDays' }, '2026-11-04')).toBe('2026-11-05');
  });
});

describe('nextOccurrence', () => {
  it('Given ежедневная задача на 2026-11-04 When я её выполняю Then создаётся копия на 2026-11-05 с тем же названием, проектом, приоритетом и повтором', () => {
    const original = task({
      id: 'orig',
      dueDate: '2026-11-04',
      dueTime: '07:00',
      projectId: 'health',
      recurrence: { kind: 'daily' },
      tags: ['утро'],
      estimateMin: 15,
      notes: 'n',
      completedAt: 5000,
    });
    expect(nextOccurrence(original, '2026-11-04')).toEqual({
      title: 'зарядка',
      dueDate: '2026-11-05',
      dueTime: '07:00',
      projectId: 'health',
      priority: 2,
      recurrence: { kind: 'daily' },
      tags: ['утро'],
      estimateMin: 15,
      notes: 'n',
    });
  });

  it('a recurring task without a due date repeats from the day it was completed', () => {
    expect(nextOccurrence(task({ recurrence: { kind: 'daily' } }), '2026-11-04')?.dueDate).toBe('2026-11-05');
  });

  it('a task without a repeat has no next occurrence', () => {
    expect(nextOccurrence(task({ dueDate: '2026-11-04' }), '2026-11-04')).toBeUndefined();
  });
});

describe('isNextCopyOf', () => {
  const original = task({ id: 'orig', dueDate: '2026-11-04', recurrence: { kind: 'daily' }, completedAt: 5000 });
  const copy = task({ id: 'copy', dueDate: '2026-11-05', recurrence: { kind: 'daily' }, createdAt: 5000 });

  it('recognises the open copy created when the original was completed', () => {
    expect(isNextCopyOf(copy, original)).toBe(true);
  });

  it('ignores a completed copy, a copy from another completion, another task and the original itself', () => {
    expect(isNextCopyOf({ ...copy, completedAt: 6000 }, original)).toBe(false);
    expect(isNextCopyOf({ ...copy, createdAt: 4000 }, original)).toBe(false);
    expect(isNextCopyOf({ ...copy, title: 'другое' }, original)).toBe(false);
    expect(isNextCopyOf(original, original)).toBe(false);
    expect(isNextCopyOf(copy, { ...original, completedAt: undefined })).toBe(false);
  });
});
