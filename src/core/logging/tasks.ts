import { format } from 'date-fns';
import { z } from 'zod';
import { toDateKey } from '../dates';
import { db } from '../db';
import { newRecord, touch } from '../ids';
import { sameProjectName } from '../projectNames';
import type { Id, Priority, Project, Task, TaskSource } from '../types';
import { DateKeyField, TimeField } from './fields';

/**
 * The ONE write path for IMPORTED tasks and projects (ADR-0007, issue #150).
 * `projects` and `tasks` belong to the tasks module, which writes them directly; the settings module
 * (history import from Todoist, #43) writes only through `importTasks()`, so validation, project
 * matching and the re-import rule live in a single place.
 */

/** Todoist priorities are 'p1' (highest) … 'p4'; LifeOS uses 1 (highest) … 4 — the same order. */
const PriorityField = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.enum(['p1', 'p2', 'p3', 'p4'])], {
    error: 'Приоритет — p1–p4 или 1–4',
  })
  .transform((p): Priority => (typeof p === 'number' ? p : (Number(p.slice(1)) as Priority)));

export const ImportProject = z.object({
  name: z.string().trim().min(1, 'Введите название проекта'),
  /** Row in the source file, for error messages. Defaults to the position in the list. */
  row: z.number().int().positive().optional(),
});

export const ImportTask = z
  .object({
    title: z.string().trim().min(1, 'Введите название задачи'),
    notes: z.string().optional(),
    /** Matched to an active project by name (case-insensitive); created when missing. */
    projectName: z.string().trim().optional(),
    priority: PriorityField.optional(),
    /** Due day; or give `dueAt` and let the import derive the LOCAL day and time. */
    dueDate: DateKeyField.optional(),
    dueTime: TimeField.optional(),
    /** Due instant (epoch ms) in the user's time zone — becomes `dueDate` + `dueTime`. */
    dueAt: z.number().int().optional(),
    completedAt: z.number().int().optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    /** Id in the source system; re-import updates the task with the same `source` + `externalId`. */
    externalId: z.string().trim().min(1).optional(),
    row: z.number().int().positive().optional(),
  })
  .refine((t) => t.dueTime === undefined || t.dueDate !== undefined || t.dueAt !== undefined, {
    message: 'Время без даты: укажите дату срока',
    path: ['dueDate'],
  });

export type ImportProject = z.input<typeof ImportProject>;
export type ImportTask = z.input<typeof ImportTask>;

export interface ImportTasksInput {
  projects: ImportProject[];
  tasks: ImportTask[];
}

export interface ImportTasksOptions {
  source: TaskSource;
}

export interface ImportTasksResult {
  projects: { created: number; reused: number };
  tasks: { created: number; updated: number };
}

type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

/** First zod issue as «Задача 3: сообщение» — the row number helps to fix the source file. */
function rowError(kind: 'Проект' | 'Задача', row: number, error: z.ZodError): Error {
  return new Error(`${kind} ${row}: ${error.issues[0]?.message ?? 'неверные данные'}`);
}

function parseAll<S extends z.ZodType>(schema: S, kind: 'Проект' | 'Задача', items: unknown[]): z.output<S>[] {
  return items.map((item, i) => {
    const r = schema.safeParse(item);
    const row = (item as { row?: number } | null)?.row ?? i + 1;
    if (!r.success) throw rowError(kind, row, r.error);
    return r.data;
  });
}

/** The task record to store, without the project link. */
function toNewTask(t: z.output<typeof ImportTask>, source: TaskSource): Omit<NewTask, 'projectId'> {
  const dueDate = t.dueAt !== undefined ? toDateKey(t.dueAt) : t.dueDate;
  const dueTime = t.dueAt !== undefined ? format(t.dueAt, 'HH:mm') : t.dueTime;
  return {
    title: t.title,
    priority: t.priority ?? 4,
    tags: t.tags ?? [],
    source,
    ...(t.notes !== undefined && { notes: t.notes }),
    ...(dueDate !== undefined && { dueDate }),
    ...(dueTime !== undefined && { dueTime }),
    ...(t.completedAt !== undefined && { completedAt: t.completedAt }),
    ...(t.externalId !== undefined && { externalId: t.externalId }),
  };
}

/**
 * Validates everything first (nothing is written when a row is invalid), then writes projects and
 * tasks in one transaction. Projects are matched to ACTIVE projects by name; tasks with an
 * `externalId` update the task with the same `source` + `externalId` instead of adding a second one.
 */
export async function importTasks(
  input: ImportTasksInput,
  options: ImportTasksOptions,
  now: number = Date.now(),
): Promise<ImportTasksResult> {
  const projects = parseAll(ImportProject, 'Проект', input.projects);
  const tasks = parseAll(ImportTask, 'Задача', input.tasks);
  const { source } = options;

  return db.transaction('rw', db.projects, db.tasks, async () => {
    const result: ImportTasksResult = { projects: { created: 0, reused: 0 }, tasks: { created: 0, updated: 0 } };
    const known = (await db.projects.toArray()).filter((p) => !p.archived);

    const projectIdFor = async (name: string): Promise<Id> => {
      const existing = known.find((p) => sameProjectName(p.name, name));
      if (existing) return existing.id;
      const project: Project = newRecord<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>(
        { name: name.trim(), archived: false },
        now,
      );
      await db.projects.add(project);
      known.push(project);
      result.projects.created += 1;
      return project.id;
    };

    for (const p of projects) {
      const before = result.projects.created;
      await projectIdFor(p.name);
      if (result.projects.created === before) result.projects.reused += 1;
    }

    for (const t of tasks) {
      const projectId = t.projectName ? await projectIdFor(t.projectName) : undefined;
      const record = { ...toNewTask(t, source), ...(projectId !== undefined && { projectId }) };
      const existing =
        t.externalId !== undefined
          ? await db.tasks.where('[source+externalId]').equals([source, t.externalId]).toArray()
          : [];
      if (existing.length > 1) {
        throw new Error(
          `Задача ${t.row ?? ''}: несколько записей с externalId «${t.externalId}» — импорт отменён`.replace('  ', ' '),
        );
      }
      if (existing.length === 1) {
        const old = existing[0];
        await db.tasks.put({ ...record, ...touch({ id: old.id, createdAt: old.createdAt }, now) } as Task);
        result.tasks.updated += 1;
      } else {
        await db.tasks.add(newRecord(record, now));
        result.tasks.created += 1;
      }
    }
    return result;
  });
}
