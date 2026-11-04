import { describe, expect, it } from 'vitest';
import { parseQuickAddExplicit } from './quickAdd';
import { draftFromQuickAdd } from './quickDraft';

const TODAY = '2026-11-04'; // Wednesday
const TOMORROW = '2026-11-05';
const draft = (line: string, defaults = {}) => draftFromQuickAdd(parseQuickAddExplicit(line, TODAY), TODAY, defaults);

describe('draftFromQuickAdd', () => {
  it('uses the list defaults when the line has no date or project, priority 4', () => {
    expect(
      draftFromQuickAdd({ title: 'купить молоко', tags: [] }, TODAY, { dueDate: '2026-11-04', projectId: 'p' }),
    ).toEqual({
      title: 'купить молоко',
      dueDate: '2026-11-04',
      projectId: 'p',
      priority: 4,
      tags: [],
    });
  });

  it('typed date, time, project and priority win over the defaults', () => {
    expect(
      draftFromQuickAdd(
        { title: 'позвонить', dueDate: '2026-11-05', dueTime: '09:00', projectName: 'учёба', priority: 1, tags: ['a'] },
        TODAY,
        { dueDate: '2026-11-04', projectId: 'p' },
      ),
    ).toEqual({
      title: 'позвонить',
      dueDate: '2026-11-05',
      dueTime: '09:00',
      projectName: 'учёба',
      priority: 1,
      tags: ['a'],
    });
  });

  it('keeps estimate and repeat', () => {
    expect(draft('отчёт ~30м каждый день')).toMatchObject({
      estimateMin: 30,
      recurrence: { kind: 'daily' },
      dueDate: TODAY,
    });
  });

  it('a time without a date in «Предстоящие» lands on the list day (tomorrow) at that time', () => {
    expect(draft('9:00 зарядка', { dueDate: TOMORROW })).toMatchObject({ dueDate: TOMORROW, dueTime: '09:00' });
    expect(draft('9:00 зарядка')).toMatchObject({ dueDate: TODAY, dueTime: '09:00' });
  });

  it('a repeat without a date starts on the list day; weekdays start on the first matching day from it', () => {
    expect(draft('каждый день зарядка', { dueDate: TOMORROW })).toMatchObject({ dueDate: TOMORROW });
    expect(draft('каждую неделю отчёт', { dueDate: TOMORROW })).toMatchObject({
      dueDate: TOMORROW,
      recurrence: { kind: 'weekly', weekdays: [4] },
    });
    expect(draft('по выходным уборка', { dueDate: TODAY })).toMatchObject({ dueDate: '2026-11-07' });
  });

  it('a project list keeps an undated line undated', () => {
    expect(draft('конспект', { projectId: 'p' })).toEqual({ title: 'конспект', projectId: 'p', priority: 4, tags: [] });
  });
});
