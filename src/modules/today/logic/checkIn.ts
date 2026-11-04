import { z } from 'zod';
import type { CheckIn } from '../../../core/types';

/** Fields of a check-in the user enters. */
export type CheckInFields = Pick<CheckIn, 'energy' | 'focus' | 'note'>;

export interface CheckInFormValues {
  energy: number | undefined;
  focus: number | undefined;
  note: string;
}

const RATING_ERROR = 'Оцените энергию и фокус';
const rating = z.number({ error: RATING_ERROR }).int(RATING_ERROR).min(1, RATING_ERROR).max(5, RATING_ERROR);

const schema = z.object({
  energy: rating,
  focus: rating,
  note: z.string().trim().max(500, 'Заметка не длиннее 500 символов'),
});

export function parseCheckIn(
  values: CheckInFormValues,
): { ok: true; data: CheckInFields } | { ok: false; error: string } {
  const r = schema.safeParse(values);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { note, ...ratings } = r.data;
  return { ok: true, data: { ...ratings, ...(note ? { note } : {}) } };
}
