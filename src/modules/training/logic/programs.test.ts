import { describe, expect, it } from 'vitest';
import {
  PROGRAM_TEMPLATES,
  WEEKDAY_ORDER,
  draftFromTemplate,
  emptyProgramDraft,
  parseProgramDraft,
  planSessions,
  sessionOn,
} from './programs';

const WEDNESDAY = '2026-11-04';

describe('program templates', () => {
  it('Given пустой блок Then стартовые шаблоны: сила 3 раза в неделю, бег, растяжка', () => {
    expect(PROGRAM_TEMPLATES.map((t) => t.name)).toEqual(['Сила 3 раза в неделю', 'Бег', 'Растяжка']);
    expect(PROGRAM_TEMPLATES[0].days).toHaveLength(3);
  });

  it('a template becomes a valid draft', () => {
    for (const t of PROGRAM_TEMPLATES) {
      expect(parseProgramDraft(draftFromTemplate(t)).ok).toBe(true);
    }
  });
});

describe('planSessions', () => {
  const days = [
    { weekday: 1, exercises: [{ name: 'Присед', sets: 3, reps: 5 }] },
    { weekday: 3, exercises: [{ name: 'Жим', sets: 3 }] },
  ];

  it('Given дни недели и упражнения When план на 4 недели Then сессии только в выбранные дни, начиная с сегодняшнего', () => {
    const plan = planSessions(days, WEDNESDAY, 4);
    expect(plan).toHaveLength(8);
    expect(plan[0]).toEqual({ date: '2026-11-04', exercises: days[1].exercises });
    expect(plan[1].date).toBe('2026-11-09'); // Monday
    expect(plan[plan.length - 1].date).toBe('2026-11-30'); // 28 days: 11-04 … 12-01
  });

  it('exercises are copies, so editing a program does not rewrite the plan', () => {
    const plan = planSessions(days, WEDNESDAY, 1);
    expect(plan[0].exercises[0]).not.toBe(days[1].exercises[0]);
  });
});

describe('sessionOn', () => {
  it('returns the planned session of the day or undefined (день отдыха)', () => {
    const s = [{ date: '2026-11-04' }, { date: '2026-11-05' }];
    expect(sessionOn(s, '2026-11-05')).toBe(s[1]);
    expect(sessionOn(s, '2026-11-06')).toBeUndefined();
  });
});

describe('parseProgramDraft', () => {
  const ok = () => ({
    ...emptyProgramDraft(),
    name: ' Моя ',
    days: [{ weekday: 1, exercises: [{ name: ' Присед ', sets: '3', reps: '5', weightKg: '80,5' }] }],
  });

  it('trims, converts numbers and accepts a decimal comma', () => {
    expect(parseProgramDraft(ok())).toEqual({
      ok: true,
      value: {
        name: 'Моя',
        weeks: 4,
        days: [{ weekday: 1, exercises: [{ name: 'Присед', sets: 3, reps: 5, weightKg: 80.5 }] }],
      },
    });
  });

  it('rejects an empty name, no days, no exercises and bad sets', () => {
    expect(parseProgramDraft({ ...ok(), name: ' ' })).toEqual({ ok: false, error: 'Введите название программы' });
    expect(parseProgramDraft({ ...ok(), days: [] })).toEqual({ ok: false, error: 'Добавьте хотя бы один день' });
    expect(parseProgramDraft({ ...ok(), days: [{ weekday: 1, exercises: [] }] })).toEqual({
      ok: false,
      error: 'Добавьте упражнение в каждый день',
    });
    const bad = ok();
    bad.days[0].exercises[0].sets = '0';
    expect(parseProgramDraft(bad)).toEqual({ ok: false, error: 'Подходы — целое число от 1' });
  });

  it('weekdays are listed Monday first', () => {
    expect(WEEKDAY_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});
