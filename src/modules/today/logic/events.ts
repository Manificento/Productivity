import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { z } from 'zod';
import { phaseFor } from '../../../core/adaptation/engine';
import { daysBetween, fromDateKey, shiftDateKey } from '../../../core/dates';
import type { DateKey, LifeEvent, LifeEventType } from '../../../core/types';

export const EVENT_TYPE_LABEL: Record<LifeEventType, string> = {
  exam: 'Экзамен',
  deadline: 'Дедлайн',
  interview: 'Собеседование',
  competition: 'Соревнование',
  travel: 'Поездка',
  other: 'Другое',
};

export const IMPORTANCE_LABEL: Record<LifeEvent['importance'], string> = {
  1: 'Обычное',
  2: 'Важное',
  3: 'Критичное',
};

/** Event fields the user edits (everything except id and timestamps). */
export type EventFields = Omit<LifeEvent, 'id' | 'createdAt' | 'updatedAt'>;

/** Raw values of the event form: inputs hold strings, empty string = not set. */
export interface EventFormValues {
  title: string;
  type: LifeEventType;
  date: string;
  time: string;
  importance: LifeEvent['importance'];
  projectId: string;
  prepDays: string;
}

export const DEFAULT_PREP_DAYS = 7;

export function emptyEventForm(date: DateKey): EventFormValues {
  return {
    title: '',
    type: 'exam',
    date,
    time: '',
    importance: 2,
    projectId: '',
    prepDays: String(DEFAULT_PREP_DAYS),
  };
}

export function eventToForm(e: LifeEvent): EventFormValues {
  return {
    title: e.title,
    type: e.type,
    date: e.date,
    time: e.time ?? '',
    importance: e.importance,
    projectId: e.projectId ?? '',
    prepDays: String(e.prepDays),
  };
}

const formSchema = z.object({
  title: z.string().trim().min(1, 'Введите название'),
  type: z.enum(['exam', 'deadline', 'interview', 'competition', 'travel', 'other']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Выберите дату'),
  time: z.union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/, 'Время в формате ЧЧ:ММ')]),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  projectId: z.string(),
  prepDays: z.coerce.number().int('От 1 до 60 дней').min(1, 'От 1 до 60 дней').max(60, 'От 1 до 60 дней'),
});

export type EventFormErrors = Partial<Record<keyof EventFormValues, string>>;

export type ParsedEventForm = { ok: true; data: EventFields } | { ok: false; errors: EventFormErrors };

/** Validates the form and converts it into event fields; optional empty fields are omitted. */
export function parseEventForm(values: EventFormValues): ParsedEventForm {
  const r = formSchema.safeParse(values);
  if (!r.success) {
    const errors: EventFormErrors = {};
    for (const issue of r.error.issues) {
      const key = issue.path[0] as keyof EventFormValues;
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const { time, projectId, ...rest } = r.data;
  return {
    ok: true,
    data: { ...rest, ...(time ? { time } : {}), ...(projectId ? { projectId } : {}) },
  };
}

function byDateTime(a: LifeEvent, b: LifeEvent): number {
  return a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');
}

/**
 * Splits events into current/upcoming (soonest first) and past (most recent first).
 * An event is past when its date is more than one day before today: the day after is still recovery.
 */
export function splitEvents(events: LifeEvent[], today: DateKey): { upcoming: LifeEvent[]; past: LifeEvent[] } {
  const isPast = (e: LifeEvent) => daysBetween(e.date, today) > 1;
  return {
    upcoming: events.filter((e) => !isPast(e)).sort(byDateTime),
    past: events.filter(isPast).sort((a, b) => byDateTime(b, a)),
  };
}

export type TimelinePhase = 'prep' | 'taper' | 'event' | 'recovery';

export interface TimelineStep {
  phase: TimelinePhase;
  label: string;
  from: DateKey;
  to: DateKey;
  status: 'done' | 'current' | 'upcoming';
}

export interface EventTimeline {
  steps: TimelineStep[];
  /** Where today is: one of the phases, before preparation starts, or after recovery. */
  position: TimelinePhase | 'before' | 'after';
  /** Days from today to the event (negative after it). */
  daysUntil: number;
}

const PHASE_STEP_LABEL: Record<TimelinePhase, string> = {
  prep: 'Подготовка',
  taper: 'Разгрузка',
  event: 'Событие',
  recovery: 'Восстановление',
};

/** Phases of one event as date ranges, consistent with the adaptation engine's `phaseFor`. */
export function eventTimeline(event: LifeEvent, today: DateKey): EventTimeline {
  const d = event.date;
  const ranges: [TimelinePhase, DateKey, DateKey][] = [
    ['prep', shiftDateKey(d, -Math.max(2, event.prepDays)), shiftDateKey(d, -2)],
    ['taper', shiftDateKey(d, -1), shiftDateKey(d, -1)],
    ['event', d, d],
    ['recovery', shiftDateKey(d, 1), shiftDateKey(d, 1)],
  ];
  const steps = ranges.map(([phase, from, to]): TimelineStep => {
    const status = today > to ? 'done' : today >= from ? 'current' : 'upcoming';
    return { phase, label: PHASE_STEP_LABEL[phase], from, to, status };
  });
  const daysUntil = daysBetween(today, d);
  const phase = phaseFor(today, event);
  const position = phase !== 'normal' ? phase : daysUntil > 0 ? 'before' : 'after';
  return { steps, position, daysUntil };
}

export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

/** «сегодня», «завтра», «через 5 дней», «3 дня назад». */
export function daysLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'сегодня';
  if (daysUntil === 1) return 'завтра';
  if (daysUntil === -1) return 'вчера';
  const n = Math.abs(daysUntil);
  return daysUntil > 0 ? `через ${n} ${pluralDays(n)}` : `${n} ${pluralDays(n)} назад`;
}

/** «9 ноября». */
export function formatDay(key: DateKey): string {
  return format(fromDateKey(key), 'd MMMM', { locale: ru });
}

/** «2 ноября – 7 ноября», or a single day. */
export function formatRange(from: DateKey, to: DateKey): string {
  return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
}
