import { describe, expect, it } from 'vitest';
import type { LifeEvent } from '../../../core/types';
import {
  daysLabel,
  emptyEventForm,
  eventTimeline,
  eventToForm,
  formatRange,
  parseEventForm,
  splitEvents,
  type EventFormValues,
} from './events';

function ev(over: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: over.id ?? 'e1',
    title: 'IELTS',
    type: 'exam',
    date: '2026-11-09',
    importance: 3,
    prepDays: 7,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const form = (over: Partial<EventFormValues> = {}): EventFormValues => ({
  title: 'IELTS',
  type: 'exam',
  date: '2026-11-09',
  time: '',
  importance: 3,
  projectId: '',
  prepDays: '7',
  ...over,
});

describe('splitEvents', () => {
  it('Given дата в прошлом больше чем на день When список отображается Then событие в разделе «Прошедшие»', () => {
    const today = '2026-11-04';
    const old = ev({ id: 'old', date: '2026-11-02' });
    const yesterday = ev({ id: 'yesterday', date: '2026-11-03' });
    const soon = ev({ id: 'soon', date: '2026-11-09' });
    const { upcoming, past } = splitEvents([soon, old, yesterday], today);
    expect(past.map((e) => e.id)).toEqual(['old']);
    // Yesterday's event is still in its recovery day, so it stays among the current ones.
    expect(upcoming.map((e) => e.id)).toEqual(['yesterday', 'soon']);
  });

  it('sorts upcoming soonest first and past most recent first', () => {
    const { upcoming, past } = splitEvents(
      [
        ev({ id: 'b', date: '2026-12-01' }),
        ev({ id: 'a', date: '2026-11-05' }),
        ev({ id: 'p1', date: '2026-10-01' }),
        ev({ id: 'p2', date: '2026-10-20' }),
      ],
      '2026-11-04',
    );
    expect(upcoming.map((e) => e.id)).toEqual(['a', 'b']);
    expect(past.map((e) => e.id)).toEqual(['p2', 'p1']);
  });

  it('orders events of the same day by time', () => {
    const { upcoming } = splitEvents(
      [ev({ id: 'late', time: '15:00' }), ev({ id: 'none' }), ev({ id: 'early', time: '09:00' })],
      '2026-11-04',
    );
    expect(upcoming.map((e) => e.id)).toEqual(['none', 'early', 'late']);
  });
});

describe('eventTimeline', () => {
  it('Given событие через 5 дней When я открываю его Then вижу таймлайн «подготовка → разгрузка → событие → восстановление» и текущую позицию', () => {
    const t = eventTimeline(ev({ date: '2026-11-09', prepDays: 7 }), '2026-11-04');
    expect(t.steps.map((s) => s.label)).toEqual(['Подготовка', 'Разгрузка', 'Событие', 'Восстановление']);
    expect(t.steps.map((s) => [s.from, s.to])).toEqual([
      ['2026-11-02', '2026-11-07'],
      ['2026-11-08', '2026-11-08'],
      ['2026-11-09', '2026-11-09'],
      ['2026-11-10', '2026-11-10'],
    ]);
    expect(t.steps.map((s) => s.status)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    expect(t.position).toBe('prep');
    expect(t.daysUntil).toBe(5);
  });

  it('is before preparation when the event is further away than prepDays', () => {
    const t = eventTimeline(ev({ date: '2026-11-20', prepDays: 7 }), '2026-11-04');
    expect(t.position).toBe('before');
    expect(t.steps.every((s) => s.status === 'upcoming')).toBe(true);
  });

  it('marks taper, event and recovery days as current on their dates', () => {
    const e = ev({ date: '2026-11-09' });
    expect(eventTimeline(e, '2026-11-08').position).toBe('taper');
    expect(eventTimeline(e, '2026-11-09').position).toBe('event');
    const recovery = eventTimeline(e, '2026-11-10');
    expect(recovery.position).toBe('recovery');
    expect(recovery.steps.map((s) => s.status)).toEqual(['done', 'done', 'done', 'current']);
  });

  it('is after the event once recovery is over', () => {
    const t = eventTimeline(ev({ date: '2026-11-09' }), '2026-11-12');
    expect(t.position).toBe('after');
    expect(t.steps.every((s) => s.status === 'done')).toBe(true);
  });

  it('matches the engine: preparation lasts at least the day before taper', () => {
    const t = eventTimeline(ev({ date: '2026-11-09', prepDays: 1 }), '2026-11-07');
    expect(t.steps[0]).toMatchObject({ from: '2026-11-07', to: '2026-11-07', status: 'current' });
  });
});

describe('daysLabel', () => {
  it.each([
    [0, 'сегодня'],
    [1, 'завтра'],
    [-1, 'вчера'],
    [2, 'через 2 дня'],
    [5, 'через 5 дней'],
    [21, 'через 21 день'],
    [12, 'через 12 дней'],
    [-3, '3 дня назад'],
    [-11, '11 дней назад'],
  ])('%i → %s', (n, label) => {
    expect(daysLabel(n)).toBe(label);
  });
});

describe('parseEventForm', () => {
  it('turns valid form values into event fields', () => {
    const r = parseEventForm(form({ time: '09:30', projectId: 'p1' }));
    expect(r).toEqual({
      ok: true,
      data: {
        title: 'IELTS',
        type: 'exam',
        date: '2026-11-09',
        time: '09:30',
        importance: 3,
        projectId: 'p1',
        prepDays: 7,
      },
    });
  });

  it('drops empty optional fields and trims the title', () => {
    const r = parseEventForm(form({ title: '  IELTS  ' }));
    expect(r.ok && r.data).toEqual({ title: 'IELTS', type: 'exam', date: '2026-11-09', importance: 3, prepDays: 7 });
    expect(r.ok && 'time' in r.data).toBe(false);
  });

  it('reports an error per invalid field in Russian', () => {
    const r = parseEventForm(form({ title: ' ', date: '', prepDays: '0' }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors).toEqual({
      title: 'Введите название',
      date: 'Выберите дату',
      prepDays: 'От 1 до 60 дней',
    });
  });

  it('rejects a fractional or too long preparation', () => {
    expect(parseEventForm(form({ prepDays: '2.5' })).ok).toBe(false);
    expect(parseEventForm(form({ prepDays: '61' })).ok).toBe(false);
    expect(parseEventForm(form({ prepDays: '60' })).ok).toBe(true);
  });
});

describe('form values', () => {
  it('starts a new event as an important exam with 7 days of preparation', () => {
    expect(emptyEventForm('2026-11-04')).toEqual(form({ title: '', date: '2026-11-04', importance: 2 }));
  });

  it('round-trips an event through the form', () => {
    const e = ev({ time: '09:30', projectId: 'p1' });
    const r = parseEventForm(eventToForm(e));
    expect(r.ok && r.data).toEqual({
      title: e.title,
      type: e.type,
      date: e.date,
      time: '09:30',
      importance: e.importance,
      projectId: 'p1',
      prepDays: e.prepDays,
    });
    expect(eventToForm(ev())).toMatchObject({ time: '', projectId: '' });
  });
});

describe('formatRange', () => {
  it('formats days in Russian', () => {
    expect(formatRange('2026-11-09', '2026-11-09')).toBe('9 ноября');
    expect(formatRange('2026-11-02', '2026-11-07')).toBe('2 ноября – 7 ноября');
  });
});
