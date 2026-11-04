import { describe, expect, it } from 'vitest';
import type { TimeEntry } from '../../../core/types';
import { countFocusSessions, focusProjectFirst, focusQuota } from './focusQuota';

const MIN = 60_000;
let seq = 0;
const e = (over: Partial<TimeEntry>): TimeEntry => ({
  id: `e${++seq}`,
  createdAt: 0,
  updatedAt: 0,
  categoryId: 'c',
  start: 0,
  end: 25 * MIN,
  date: '2026-11-05',
  source: 'pomodoro',
  ...over,
});

describe('countFocusSessions', () => {
  it('считает фокус-сессии дня: только Pomodoro, только этот день, от 10 минут', () => {
    const entries = [
      e({}),
      e({ end: 10 * MIN }), // exactly the threshold — counts
      e({ end: 10 * MIN - 1 }), // stopped early — does not count
      e({ source: 'timer' }),
      e({ date: '2026-11-04' }),
      e({ end: undefined }),
    ];
    expect(countFocusSessions(entries, '2026-11-05')).toBe(2);
  });
});

describe('focusQuota', () => {
  it('focusPomodoros = 7 и сегодня 3 фокус-сессии: «3 из 7»', () => {
    expect(focusQuota({ focusPomodoros: 7, reasons: [] }, 3)).toEqual({ kind: 'quota', done: 3, target: 7 });
  });

  it('focusPomodoros = 0 (день события): без фокус-сессий с причиной из reasons', () => {
    expect(focusQuota({ focusPomodoros: 0, reasons: ['Сегодня «IELTS»: только самое важное'] }, 0)).toEqual({
      kind: 'none',
      reasons: ['Сегодня «IELTS»: только самое важное'],
    });
  });
});

describe('focusProjectFirst', () => {
  const tasks = [
    { id: 'a', projectId: 'other' },
    { id: 'b' },
    { id: 'c', projectId: 'english' },
    { id: 'd', projectId: 'english' },
  ];

  it('focusProjectId задан: задачи этого проекта стоят первыми, порядок внутри групп сохранён', () => {
    expect(focusProjectFirst(tasks, 'english').map((t) => t.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('без фокус-проекта порядок не меняется', () => {
    expect(focusProjectFirst(tasks).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
