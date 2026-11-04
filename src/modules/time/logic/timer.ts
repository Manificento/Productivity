import { isValid, parseISO } from 'date-fns';
import { toDateKey } from '../../../core/dates';
import type { DateKey, Id, Millis } from '../../../core/types';

/** Categories offered when the user has none yet. */
export const DEFAULT_CATEGORY_NAMES = ['Учёба', 'Работа', 'Спорт', 'Отдых', 'Быт'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** Timer display: 'MM:SS' under an hour, 'H:MM:SS' after. Negative durations show as zero. */
export function formatDuration(ms: Millis): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export interface ManualEntryInput {
  categoryId: Id;
  /** Local date-time from `<input type="datetime-local">`, 'YYYY-MM-DDTHH:mm'. */
  start: string;
  end: string;
}

export interface ManualEntry {
  categoryId: Id;
  start: Millis;
  end: Millis;
  date: DateKey;
}

export type ParseResult<T, F extends string> = { ok: true; value: T } | { ok: false; field: F; error: string };

function parseLocal(value: string): Millis | undefined {
  if (!value) return undefined;
  const d = parseISO(value);
  return isValid(d) ? d.getTime() : undefined;
}

/** Validates a hand-entered time record. The entry belongs to the local day of its start. */
export function parseManualEntry(input: ManualEntryInput): ParseResult<ManualEntry, keyof ManualEntryInput> {
  if (!input.categoryId) return { ok: false, field: 'categoryId', error: 'Выберите категорию' };
  const start = parseLocal(input.start);
  const end = parseLocal(input.end);
  if (start === undefined) return { ok: false, field: 'start', error: 'Укажите начало' };
  if (end === undefined) return { ok: false, field: 'end', error: 'Укажите конец' };
  if (end <= start) return { ok: false, field: 'end', error: 'Конец должен быть позже начала' };
  return { ok: true, value: { categoryId: input.categoryId, start, end, date: toDateKey(start) } };
}
