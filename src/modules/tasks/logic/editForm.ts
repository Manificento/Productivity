import type { DateKey, Id, Priority, Task } from '../../../core/types';
import { validateTitle } from './tasks';

/** The task editor's fields, as the inputs hold them (strings; '' = empty). */
export interface TaskForm {
  title: string;
  notes: string;
  projectId: string;
  priority: '1' | '2' | '3' | '4';
  dueDate: string;
  dueTime: string;
  estimate: string;
  tags: string;
}

/** Editable fields of a task; undefined means "remove this field". */
export interface TaskPatch {
  title: string;
  notes: string | undefined;
  projectId: Id | undefined;
  priority: Priority;
  dueDate: DateKey | undefined;
  dueTime: string | undefined;
  estimateMin: number | undefined;
  tags: string[];
}

export type FormErrors = Partial<Record<keyof TaskForm, string>>;

export function taskToForm(task: Task): TaskForm {
  return {
    title: task.title,
    notes: task.notes ?? '',
    projectId: task.projectId ?? '',
    priority: String(task.priority) as TaskForm['priority'],
    dueDate: task.dueDate ?? '',
    dueTime: task.dueTime ?? '',
    estimate: task.estimateMin === undefined ? '' : String(task.estimateMin),
    tags: task.tags.join(', '),
  };
}

/** «@учёба, вечер учёба» → ['учёба', 'вечер']. */
export function parseTags(text: string): string[] {
  const tags = text
    .split(/[\s,]+/)
    .map((t) => t.replace(/^@+/, ''))
    .filter(Boolean);
  return [...new Set(tags)];
}

const MAX_ESTIMATE_MIN = 24 * 60;

export function validateForm(form: TaskForm): FormErrors {
  const errors: FormErrors = {};
  const title = validateTitle(form.title);
  if (title) errors.title = title;
  if (form.estimate.trim() !== '') {
    const n = Number(form.estimate);
    if (!Number.isInteger(n) || n <= 0 || n > MAX_ESTIMATE_MIN) errors.estimate = 'Оценка — целое число минут больше 0';
  }
  if (form.dueTime && !form.dueDate) errors.dueTime = 'Сначала укажите дату';
  return errors;
}

const orUndefined = (s: string) => (s.trim() === '' ? undefined : s.trim());

/** Turns a valid form into the fields to store. */
export function formToPatch(form: TaskForm): TaskPatch {
  const dueDate = orUndefined(form.dueDate);
  const estimate = orUndefined(form.estimate);
  return {
    title: form.title.trim(),
    notes: orUndefined(form.notes),
    projectId: orUndefined(form.projectId),
    priority: Number(form.priority) as Priority,
    dueDate,
    dueTime: dueDate ? orUndefined(form.dueTime) : undefined,
    estimateMin: estimate === undefined ? undefined : Number(estimate),
    tags: parseTags(form.tags),
  };
}
