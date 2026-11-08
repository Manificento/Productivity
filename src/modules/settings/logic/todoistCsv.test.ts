import SAMPLE from '../../../../docs/samples/todoist-template.csv?raw';
import { describe, expect, it } from 'vitest';
import { decodeUtf8, parseTodoistCsv, todoistExternalId, type TodoistPreview } from './todoistCsv';

const HEADER =
  'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG';

function preview(csv: string, name?: string): TodoistPreview {
  const r = parseTodoistCsv(csv, name);
  if (!r.ok) throw new Error(r.error);
  return r.preview;
}

describe('Todoist CSV: parser', () => {
  it('Given the official template Then 4 tasks, 1 project, priorities 1,4,4,3 and 2 durations are recognized', () => {
    const p = preview(SAMPLE);
    expect(p.tasks).toHaveLength(4);
    expect(p.project.name).toBe('Импорт Todoist');
    expect(p.tasks.map((t) => t.priority)).toEqual([1, 4, 4, 3]);
    expect(p.durations).toBe(2);
    expect(p.durationsMin).toEqual([30, undefined, 120, undefined]);
  });

  it('Given DURATION in minutes When the import runs Then they go to estimateMin, rounded to whole minutes; a duration over a day is not passed and not counted', () => {
    expect(preview(SAMPLE).tasks.map((t) => t.estimateMin)).toEqual([30, undefined, 120, undefined]);
    const p = preview(
      [
        HEADER,
        'task,Час,,4,1,,,,,,1,hour,,',
        'task,Сутки,,4,1,,,,,,1,day,,',
        'task,Двое суток,,4,1,,,,,,2,day,,',
        'task,Двадцать с половиной минут,,4,1,,,,,,20.5,minute,,',
        'task,Полтора часа,,4,1,,,,,,1.5,hour,,',
        'task,Четверть минуты,,4,1,,,,,,0.25,minute,,',
      ].join('\n'),
    );
    expect(p.tasks.map((t) => t.estimateMin)).toEqual([60, 1440, undefined, 21, 90, undefined]);
    // The preview promises only the estimates that will be saved.
    expect(p.durations).toBe(4);
  });

  it('Given note, section, INDENT>=2, meta and empty rows Then note joins the task above, section becomes a tag, nested is a separate task, meta and empty are skipped', () => {
    const p = preview(
      `${HEADER}\nmeta,view_style=list,,,,,,,,,,,,\n,,,,,,,,,,,,,\nsection,Дом,,,,,,,,,,,,\ntask,Уборка,,4,1,,,,,,,,,\nnote,Пылесос внизу,,,,,,,,,,,,\ntask,Окна,,4,2,,,,,,,,,\n`,
      'Дом.csv',
    );
    expect(p.tasks.map((t) => t.title)).toEqual(['Уборка', 'Окна']);
    expect(p.tasks[0]?.notes).toBe('Пылесос внизу');
    expect(p.tasks.every((t) => t.projectName === 'Дом' && t.tags?.[0] === 'Дом')).toBe(true);
  });

  it('Given ISO DATE or DEADLINE Then the due is a day and HH:mm; an empty DATE falls back to DEADLINE', () => {
    const p = preview(
      `${HEADER}\ntask,A,,4,1,,,2025-03-31T11:00:00,en,,,,,\ntask,B,,4,1,,,2025-04-01,en,,,,,\ntask,C,,4,1,,,,,,,,2025-02-24,en\n`,
    );
    expect(p.tasks[0]).toMatchObject({ dueDate: '2025-03-31', dueTime: '11:00' });
    expect(p.tasks[1]).toMatchObject({ dueDate: '2025-04-01' });
    expect(p.tasks[1]?.dueTime).toBeUndefined();
    expect(p.tasks[2]).toMatchObject({ dueDate: '2025-02-24' });
  });

  it('Given a natural-language DATE Then no due, the raw text goes to notes and is counted as unrecognized', () => {
    const p = preview(SAMPLE);
    expect(p.unrecognizedDates).toBe(3);
    const first = p.tasks[0];
    expect(first?.dueDate).toBeUndefined();
    expect(first?.notes).toContain('срок из Todoist: today at 11:00');
    expect(first?.notes).toContain('дедлайн из Todoist: 2025-03-31');
    expect(first?.notes).toContain('Only available on Tuesdays and Thursdays');
  });

  it('Given the same file twice Then externalId is stable and differs per project and text', () => {
    const a = preview(SAMPLE).tasks.map((t) => t.externalId);
    expect(preview(SAMPLE).tasks.map((t) => t.externalId)).toEqual(a);
    expect(new Set(a).size).toBe(4);
    expect(todoistExternalId('P1', 'x')).not.toBe(todoistExternalId('P2', 'x'));
  });

  it('Given a file without the TYPE,CONTENT header or not UTF-8 Then an error is returned', () => {
    expect(parseTodoistCsv('a,b\n1,2')).toMatchObject({ ok: false });
    expect(parseTodoistCsv('')).toMatchObject({ ok: false });
    expect(decodeUtf8(new Uint8Array([0xff, 0xfe, 0x41]))).toBeNull();
    expect(decodeUtf8(new TextEncoder().encode('Привет'))).toBe('Привет');
  });

  it('handles quoted cells with commas, quotes and line breaks', () => {
    const p = preview(`${HEADER}\ntask,"Купить, ""молоко""",\"a\nb\",4,1,,,,,,,,,\n`);
    expect(p.tasks[0]).toMatchObject({ title: 'Купить, "молоко"', notes: 'a\nb' });
  });
  it('Given an ISO DATE with an offset Then it becomes an instant, not a UTC day stored as local', () => {
    const p = preview(`${HEADER}\ntask,A,,4,1,,,2025-03-31T23:30:00Z,en,,,,,\ntask,B,,4,1,,,2025-02-30,en,,,,,\n`);
    expect(p.tasks[0]).toMatchObject({ dueAt: Date.parse('2025-03-31T23:30:00Z') });
    expect(p.tasks[0]?.dueDate).toBeUndefined();
    expect(p.tasks[1]?.dueDate).toBeUndefined();
    expect(p.unrecognizedDates).toBe(1);
  });

  it('Given two tasks with the same text Then both are kept with different stable externalIds; project case is ignored', () => {
    const csv = `${HEADER}\ntask,Позвонить,,4,1,,,,,,,,,\ntask,Позвонить,,4,1,,,,,,,,,\n`;
    const ids = preview(csv).tasks.map((t) => t.externalId);
    expect(new Set(ids).size).toBe(2);
    expect(preview(csv).tasks.map((t) => t.externalId)).toEqual(ids);
    expect(todoistExternalId('Дом', 'x')).toBe(todoistExternalId('дом', 'x'));
  });
});
