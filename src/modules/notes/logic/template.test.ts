import { describe, expect, it } from 'vitest';
import type { DailyTargets } from '../../../core/adaptation/types';
import type { LifeEvent } from '../../../core/types';
import { dayTitle, relatedNotes } from './notes';
import { buildPrepTemplate, prepTitle } from './template';

const event = { id: 'e1', title: 'IELTS' } as LifeEvent;
const row = (date: string, phase: DailyTargets['phase']) =>
  ({ date, phase, taskCapacityMin: 120, sleepHours: 8, focusPomodoros: 5 }) as DailyTargets;

describe('шаблон «подготовка к событию»', () => {
  it('has a title, a plan line per day with its phase, and a checklist', () => {
    const body = buildPrepTemplate(event, [row('2026-11-08', 'prep'), row('2026-11-09', 'event')]);
    expect(prepTitle(event)).toBe('Подготовка: IELTS');
    expect(body).toContain('# Подготовка: IELTS');
    expect(body).toMatch(/- 8 нояб\.? \(подготовка\): задачи 120 мин, сон 8 ч, фокус 5/);
    expect(body).toMatch(/- 9 нояб\.? \(день события\)/);
  });
});

describe('relatedNotes / dayTitle', () => {
  const n = (id: string, linkIds: string[], updatedAt: number) => ({ id, linkIds, updatedAt }) as never;
  it('returns other notes sharing a link, newest first', () => {
    const list = [n('a', ['x'], 1), n('b', ['x', 'y'], 3), n('c', ['y'], 2), n('d', ['z'], 4)];
    expect(relatedNotes(list, { id: 'a', linkIds: ['x'] }).map((x: { id: string }) => x.id)).toEqual(['b']);
    expect(relatedNotes(list, { id: 'a', linkIds: ['x', 'y'] }).map((x: { id: string }) => x.id)).toEqual(['b', 'c']);
  });
  it('formats the day page title', () => {
    expect(dayTitle('2026-11-04')).toBe('4 ноября 2026');
  });
});
