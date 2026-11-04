import { describe, expect, it } from 'vitest';
import { DEFAULT_BASELINE } from '../../../core/adaptation/rules';
import { baselineToForm, parseBaseline, type BaselineFormValues } from './baseline';

const form = (over: Partial<BaselineFormValues> = {}): BaselineFormValues => ({
  ...baselineToForm(DEFAULT_BASELINE),
  ...over,
});

describe('parseBaseline', () => {
  it('round-trips the default baseline through the form', () => {
    expect(parseBaseline(form())).toEqual({ ok: true, data: DEFAULT_BASELINE });
  });

  it('accepts a capacity of 300 minutes and bedtime 23:00', () => {
    const r = parseBaseline(form({ taskCapacityMin: '300', bedtime: '23:00' }));
    expect(r).toEqual({ ok: true, data: { ...DEFAULT_BASELINE, taskCapacityMin: 300, bedtime: '23:00' } });
  });

  it('Given ввод ёмкости 0 или > 960 When сохранение Then ошибка валидации (zod)', () => {
    for (const taskCapacityMin of ['0', '961', '']) {
      const r = parseBaseline(form({ taskCapacityMin }));
      expect(r).toEqual({ ok: false, errors: { taskCapacityMin: 'От 1 до 960 минут' } });
    }
    expect(parseBaseline(form({ taskCapacityMin: '960' })).ok).toBe(true);
  });

  it('validates every other field', () => {
    const r = parseBaseline(
      form({
        sleepHours: '3',
        bedtime: '',
        focusPomodoros: '1.5',
        meditationMin: '-1',
        caffeineCutoff: '25:00',
      }),
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        sleepHours: 'От 4 до 12 часов',
        bedtime: 'Укажите время',
        focusPomodoros: 'Целое число от 0 до 16',
        meditationMin: 'От 0 до 120 минут',
        caffeineCutoff: 'Укажите время',
      },
    });
  });

  it('accepts half hours of sleep and a comma as the decimal separator', () => {
    const r = parseBaseline(form({ sleepHours: '7,5' }));
    expect(r.ok && r.data.sleepHours).toBe(7.5);
  });

  it('allows sleep only in half-hour steps', () => {
    expect(parseBaseline(form({ sleepHours: '7.3' }))).toEqual({ ok: false, errors: { sleepHours: 'Шаг — полчаса' } });
  });
});
