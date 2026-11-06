import { describe, expect, it } from 'vitest';
import { describeSchedule, habitFormValues, parseHabitForm, type HabitFormInput } from './habitForm';

const base: HabitFormInput = {
  name: 'Зарядка',
  kind: 'daily',
  weekdays: [],
  timesPerWeek: '3',
  color: '#6366f1',
  essential: false,
};

describe('parseHabitForm', () => {
  it('каждый день: название, расписание и цвет сохраняются', () => {
    expect(parseHabitForm({ ...base, name: '  Зарядка  ' })).toEqual({
      ok: true,
      value: { name: 'Зарядка', schedule: { kind: 'daily' }, color: '#6366f1', essential: false },
    });
  });

  it('дни недели: сохраняются без повторов, по порядку', () => {
    expect(parseHabitForm({ ...base, kind: 'weekdays', weekdays: [5, 1, 3, 1] })).toMatchObject({
      ok: true,
      value: { schedule: { kind: 'weekdays', weekdays: [1, 3, 5] } },
    });
  });

  it('N раз в неделю: число от 1 до 7', () => {
    expect(parseHabitForm({ ...base, kind: 'timesPerWeek', timesPerWeek: '4' })).toMatchObject({
      ok: true,
      value: { schedule: { kind: 'timesPerWeek', timesPerWeek: 4 } },
    });
    for (const bad of ['0', '8', '2.5', '']) {
      expect(parseHabitForm({ ...base, kind: 'timesPerWeek', timesPerWeek: bad })).toMatchObject({
        ok: false,
        field: 'timesPerWeek',
      });
    }
  });

  it('ошибки: пустое или слишком длинное название, нет дней недели', () => {
    expect(parseHabitForm({ ...base, name: '  ' })).toEqual({ ok: false, field: 'name', error: 'Введите название' });
    expect(parseHabitForm({ ...base, name: 'я'.repeat(81) })).toMatchObject({ ok: false, field: 'name' });
    expect(parseHabitForm({ ...base, kind: 'weekdays', weekdays: [] })).toEqual({
      ok: false,
      field: 'weekdays',
      error: 'Выберите хотя бы один день',
    });
  });
});

describe('habitFormValues', () => {
  it('значения по умолчанию и для существующей привычки', () => {
    expect(habitFormValues()).toMatchObject({ name: '', kind: 'daily', weekdays: [1, 2, 3, 4, 5], timesPerWeek: '3' });
    expect(
      habitFormValues({ name: 'Бег', schedule: { kind: 'timesPerWeek', timesPerWeek: 2 }, color: '#000' }),
    ).toMatchObject({ name: 'Бег', kind: 'timesPerWeek', timesPerWeek: '2', color: '#000' });
  });
});

describe('describeSchedule', () => {
  it.each([
    [{ kind: 'daily' as const }, 'каждый день'],
    [{ kind: 'weekdays' as const, weekdays: [0, 1, 3, 5] }, 'пн, ср, пт, вс'],
    [{ kind: 'timesPerWeek' as const, timesPerWeek: 3 }, '3 раза в неделю'],
    [{ kind: 'timesPerWeek' as const, timesPerWeek: 5 }, '5 раз в неделю'],
    [{ kind: 'timesPerWeek' as const, timesPerWeek: 1 }, '1 раз в неделю'],
  ])('%o → %s', (schedule, text) => {
    expect(describeSchedule(schedule)).toBe(text);
  });
});

describe('флаг «ключевая»', () => {
  it('Given привычка When я редактирую её Then флаг «ключевая», по умолчанию выключен', () => {
    expect(habitFormValues().essential).toBe(false);
    expect(habitFormValues({ name: 'a', schedule: { kind: 'daily' } }).essential).toBe(false);
    expect(habitFormValues({ name: 'a', schedule: { kind: 'daily' }, essential: true }).essential).toBe(true);
    expect(parseHabitForm({ ...base, essential: true })).toMatchObject({ ok: true, value: { essential: true } });
  });
});
