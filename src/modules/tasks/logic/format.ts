import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { daysBetween, fromDateKey } from '../../../core/dates';
import type { DateKey, Recurrence } from '../../../core/types';
import type { ParsedTask } from './quickAdd';

const NEAR: Record<number, string> = { [-1]: 'Вчера', 0: 'Сегодня', 1: 'Завтра' };

function dateText(date: DateKey, today: DateKey): string {
  const pattern = date.slice(0, 4) === today.slice(0, 4) ? 'd MMM' : 'd MMM yyyy';
  return format(fromDateKey(date), pattern, { locale: ru });
}

/** «Сегодня», «Завтра 09:00», «12 нояб.» — a short due label for a task row. */
export function dueLabel(date: DateKey, today: DateKey, time?: string): string {
  const day = NEAR[daysBetween(today, date)] ?? dateText(date, today);
  return time ? `${day} ${time}` : day;
}

/** Heading of a day group in «Предстоящие»: «Завтра · чт, 5 нояб.», «пн, 9 нояб.». */
export function dayHeading(date: DateKey, today: DateKey): string {
  const full = `${format(fromDateKey(date), 'EEEEEE', { locale: ru })}, ${dateText(date, today)}`;
  const near = NEAR[daysBetween(today, date)];
  return near ? `${near} · ${full}` : full;
}

const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** «каждый день», «по пн, ср», «по будням», «каждые 3 дн.». */
export function recurrenceLabel(r: Recurrence): string {
  switch (r.kind) {
    case 'daily':
      return 'каждый день';
    case 'monthly':
      return 'каждый месяц';
    case 'everyNDays':
      return `каждые ${r.interval ?? 1} дн.`;
    default: {
      const days = r.weekdays ?? [];
      if (days.join() === '1,2,3,4,5') return 'по будням';
      if (days.length === 0) return 'каждую неделю';
      // Monday first, Sunday last.
      return `по ${[...days]
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) => WEEKDAY_SHORT[d])
        .join(', ')}`;
    }
  }
}

/** «~30 мин», «~1 ч», «~1 ч 30 мин». */
export function estimateLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `~${[h ? `${h} ч` : '', m ? `${m} мин` : ''].filter(Boolean).join(' ')}`;
}

/** Chips under the quick add field: what the typed line was understood as. */
export function previewChips(p: ParsedTask, today: DateKey): string[] {
  return [
    p.dueDate && dueLabel(p.dueDate, today, p.dueTime),
    p.projectName && `#${p.projectName}`,
    p.priority && p.priority !== 4 && `P${p.priority}`, // P4 is the default, not news
    ...p.tags.map((t) => `@${t}`),
    p.estimateMin && estimateLabel(p.estimateMin),
    p.recurrence && `↻ ${recurrenceLabel(p.recurrence)}`,
  ].filter((c): c is string => typeof c === 'string' && c !== '');
}
