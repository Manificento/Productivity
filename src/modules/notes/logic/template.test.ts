import { describe, expect, it } from 'vitest';
import type { DailyTargets } from '../../../core/adaptation/types';
import type { LifeEvent } from '../../../core/types';
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

  it('says so when no day of the next 10 differs from a normal one', () => {
    const body = buildPrepTemplate(event, [row('2026-11-08', 'normal')]);
    expect(body).toContain('обычном режиме');
  });
});
