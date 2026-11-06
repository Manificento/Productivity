import { describe, expect, it } from 'vitest';
import type { Task } from '../../../core/types';
import { parseQuickAdd } from './quickAdd';
import { isNextCopyOf, nextDueDate, nextOccurrence } from './recurrence';

function task(over: Partial<Task>): Task {
  return { id: 't', createdAt: 0, updatedAt: 0, title: 'зарядка', priority: 2, tags: [], ...over };
}

/** Due dates of `count` copies, each completed on its due date. */
function dueChain(first: Task, count: number): string[] {
  const due: string[] = [];
  let current = first;
  for (let i = 0; i < count; i++) {
    const next = nextOccurrence(current, current.dueDate!)!;
    due.push(next.dueDate!);
    current = task({ ...next });
  }
  return due;
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

  it('Given ежемесячная задача, созданная на 31 января When её копии выполняются по очереди Then сроки: 28 февраля → 31 марта → 30 апреля', () => {
    const parsed = parseQuickAdd('31 января каждый месяц аренда', '2026-11-04');
    expect(dueChain(task({ dueDate: parsed.dueDate, recurrence: parsed.recurrence }), 3)).toEqual([
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
  });

  it('the anchor also brings a leap-year February back: 30 Jan → 29 Feb → 30 Mar', () => {
    expect(nextDueDate({ kind: 'monthly', dayOfMonth: 30 }, '2028-01-30')).toBe('2028-02-29');
    expect(nextDueDate({ kind: 'monthly', dayOfMonth: 30 }, '2028-02-29')).toBe('2028-03-30');
  });

  it('Given старые записи без якоря When они повторяются Then поведение прежнее (день из срока), миграция не нужна', () => {
    expect(nextDueDate({ kind: 'monthly' }, '2027-02-28')).toBe('2027-03-28');
    expect(nextDueDate({ kind: 'monthly' }, '2027-03-31')).toBe('2027-04-30');
    expect(dueChain(task({ dueDate: '2027-01-31', recurrence: { kind: 'monthly' } }), 2)).toEqual([
      '2027-02-28',
      '2027-03-28',
    ]);
  });

  it('a stale anchor (the due date was moved by hand to another day) gives way to the new day for good', () => {
    expect(nextDueDate({ kind: 'monthly', dayOfMonth: 31 }, '2027-03-15')).toBe('2027-04-15');
    const moved = (dueDate: string) => task({ dueDate, recurrence: { kind: 'monthly', dayOfMonth: 31 } });
    // Even when the chain later reaches the end of a short month, the old anchor does not come back.
    expect(dueChain(moved('2027-01-28'), 3)).toEqual(['2027-02-28', '2027-03-28', '2027-04-28']);
    expect(dueChain(moved('2027-03-30'), 3)).toEqual(['2027-04-30', '2027-05-30', '2027-06-30']);
    expect(nextOccurrence(moved('2027-01-28'), '2027-01-28')?.recurrence).toEqual({ kind: 'monthly', dayOfMonth: 28 });
  });

  it('an invalid anchor (e.g. from an import) is ignored', () => {
    expect(nextDueDate({ kind: 'monthly', dayOfMonth: 0 }, '2027-01-31')).toBe('2027-02-28');
    expect(nextDueDate({ kind: 'monthly', dayOfMonth: 40 }, '2027-02-28')).toBe('2027-03-28');
  });

  it('Given задача «каждые 3 дня» When я её выполняю Then следующая — через 3 дня от срока', () => {
    expect(nextDueDate({ kind: 'everyNDays', interval: 3 }, '2026-11-29')).toBe('2026-12-02');
    expect(nextDueDate({ kind: 'everyNDays' }, '2026-11-04')).toBe('2026-11-05');
    expect(nextDueDate({ kind: 'everyNDays', interval: Number.NaN }, '2026-11-04')).toBe('2026-11-05');
    expect(nextDueDate({ kind: 'everyNDays', interval: 2.7 }, '2026-11-04')).toBe('2026-11-06');
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

  it('Given задача с source и externalId (из импорта) и повтором When я выполняю её и создаётся следующая копия (nextOccurrence) Then у копии нет полей source и externalId; остальные поля копируются как раньше', () => {
    const fields = {
      dueDate: '2026-11-04',
      dueTime: '07:00',
      projectId: 'health',
      recurrence: { kind: 'daily' } as const,
      tags: ['а'],
      notes: 'n',
    };
    const imported = nextOccurrence(task({ ...fields, source: 'todoist', externalId: 'ext-1' }), '2026-11-04')!;
    expect(imported).not.toHaveProperty('source');
    expect(imported).not.toHaveProperty('externalId');
    expect(imported).toEqual(nextOccurrence(task(fields), '2026-11-04'));
    expect(imported).toMatchObject({ projectId: 'health', dueTime: '07:00', notes: 'n', dueDate: '2026-11-05' });
  });

  it('a recurring task without a due date repeats from the day it was completed', () => {
    expect(nextOccurrence(task({ recurrence: { kind: 'daily' } }), '2026-11-04')?.dueDate).toBe('2026-11-05');
  });

  it('an overdue repeating task completed today gets its next copy in the future, keeping the cadence', () => {
    expect(nextOccurrence(task({ dueDate: '2026-11-01', recurrence: { kind: 'daily' } }), '2026-11-04')?.dueDate).toBe(
      '2026-11-05',
    );
    const every3 = task({ dueDate: '2026-10-30', recurrence: { kind: 'everyNDays', interval: 3 } });
    expect(nextOccurrence(every3, '2026-11-04')?.dueDate).toBe('2026-11-05'); // 30.10 → 2.11 → 5.11
  });

  it('a task completed before its due date repeats from the due date', () => {
    expect(nextOccurrence(task({ dueDate: '2026-11-06', recurrence: { kind: 'daily' } }), '2026-11-04')?.dueDate).toBe(
      '2026-11-07',
    );
  });

  it('a task without a repeat has no next occurrence', () => {
    expect(nextOccurrence(task({ dueDate: '2026-11-04' }), '2026-11-04')).toBeUndefined();
  });
});

describe('isNextCopyOf', () => {
  const original = task({ id: 'orig', dueDate: '2026-11-04', recurrence: { kind: 'daily' }, completedAt: 5000 });
  const copy = task({ id: 'copy', dueDate: '2026-11-05', recurrence: { kind: 'daily' }, createdAt: 5000 });

  it('recognises the open copy created when the original was completed, even after a rename', () => {
    expect(isNextCopyOf(copy, original)).toBe(true);
    expect(isNextCopyOf({ ...copy, title: 'переименована' }, original)).toBe(true);
  });

  it('ignores a completed copy, a copy from another completion, another task and the original itself', () => {
    expect(isNextCopyOf({ ...copy, completedAt: 6000 }, original)).toBe(false);
    expect(isNextCopyOf({ ...copy, createdAt: 4000 }, original)).toBe(false);
    expect(isNextCopyOf({ ...copy, recurrence: undefined }, original)).toBe(false);
    expect(isNextCopyOf(original, original)).toBe(false);
    expect(isNextCopyOf(copy, { ...original, completedAt: undefined })).toBe(false);
  });
});
