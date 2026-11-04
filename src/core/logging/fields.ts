import { isValid } from 'date-fns';
import { z } from 'zod';
import { fromDateKey, toDateKey } from '../dates';

/** A local calendar day 'YYYY-MM-DD' that exists (no 2026-13-45). */
export const DateKeyField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть днём в формате ГГГГ-ММ-ДД')
  .refine((d) => isValid(fromDateKey(d)) && toDateKey(fromDateKey(d)) === d, 'Такого дня нет в календаре');

/** Clock time 'HH:mm'. */
export const TimeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время должно быть в формате ЧЧ:ММ');
