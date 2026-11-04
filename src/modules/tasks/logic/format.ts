import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { daysBetween, fromDateKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';

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
