import { describe, expect, it } from 'vitest';
import { draftFromQuickAdd } from './quickDraft';

describe('draftFromQuickAdd', () => {
  it('uses the list defaults when the line has no date or project, priority 4', () => {
    expect(draftFromQuickAdd({ title: 'купить молоко', tags: [] }, { dueDate: '2026-11-04', projectId: 'p' })).toEqual({
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
    expect(
      draftFromQuickAdd({
        title: 'x',
        tags: [],
        estimateMin: 30,
        recurrence: { kind: 'daily' },
        dueDate: '2026-11-04',
      }),
    ).toMatchObject({ estimateMin: 30, recurrence: { kind: 'daily' } });
  });
});
