import { isValid } from 'date-fns';
import { fromDateKey, toDateKey } from '../../../core/dates';
import type { ImportProject, ImportTask } from '../../../core/logging/tasks';

/**
 * Чистый разбор CSV-экспорта проекта Todoist (официальный шаблон, docs/samples/todoist-template.csv).
 * Ничего не пишет: результат отдают в `importTasks()` после подтверждения.
 */

export const DEFAULT_PROJECT_NAME = 'Импорт Todoist';
export const NOTE_DUE_LABEL = 'срок из Todoist';

export interface TodoistPreview {
  project: ImportProject;
  tasks: ImportTask[];
  /** Длительность каждой задачи в минутах (как в `tasks`), undefined — не указана. */
  durationsMin: (number | undefined)[];
  /** Задач, чья длительность (30 мин, 2 ч …) станет оценкой `estimateMin`. */
  durations: number;
  /** Задач, у которых DATE написан словами и срок не перенесён. */
  unrecognizedDates: number;
}

export type TodoistParseResult = { ok: true; preview: TodoistPreview } | { ok: false; error: string };

export const NOT_UTF8_ERROR = 'Файл не в кодировке UTF-8. Сохраните CSV в UTF-8 и загрузите снова.';
export const BAD_FORMAT_ERROR =
  'Это не экспорт Todoist: в первой строке нет заголовка «TYPE,CONTENT,…». Данные не изменены.';

/** Строгое чтение UTF-8: null, если байты не UTF-8. */
export function decodeUtf8(bytes: ArrayBuffer | Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** CSV по RFC 4180: запятые, кавычки, переводы строк внутри кавычек. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Стабильный 32-битный хеш (FNV-1a) → 8 hex-символов. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Проект сравнивается без учёта регистра, как в `importTasks`; `occurrence` — номер повтора того же текста в файле. */
export function todoistExternalId(project: string, title: string, occurrence = 1): string {
  const p = project.trim().toLocaleLowerCase('ru');
  const t = occurrence > 1 ? `${title}\u0000#${occurrence}` : title;
  return `${hash(`${p}\u0000${t}`)}${hash(`${t}\u0000${p}`)}`;
}

const ISO = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

type ParsedDue = { dueDate: string; dueTime?: string } | { dueAt: number };

/**
 * ISO-срок: `2025-03-31`, `2025-03-31T11:00:00` → день и время как записано;
 * со смещением (`Z`, `+03:00`) — момент времени, локальный день и время выведет `importTasks`.
 * Несуществующий день или время → undefined.
 */
export function parseIsoDue(value: string): ParsedDue | undefined {
  const m = ISO.exec(value.trim());
  const day = m?.[1];
  if (!m || !day) return undefined;
  const d = fromDateKey(day);
  if (!isValid(d) || toDateKey(d) !== day) return undefined;
  const time = m[2];
  if (time && !HH_MM.test(time)) return undefined;
  if (m[3] && time) {
    const at = Date.parse(`${day}T${time}:00${m[3] === 'Z' ? 'Z' : m[3].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')}`);
    return Number.isNaN(at) ? undefined : { dueAt: at };
  }
  return { dueDate: day, ...(time && { dueTime: time }) };
}

function durationMinutes(value: string, unit: string): number | undefined {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n) || n <= 0) return undefined;
  const u = unit.trim().toLowerCase();
  if (u === 'minute' || u === '') return n;
  if (u === 'hour') return n * 60;
  if (u === 'day') return n * 24 * 60;
  return undefined;
}

/** Имя проекта из имени файла: «Работа.csv» → «Работа». */
export function projectNameFromFile(fileName?: string): string {
  const name = (fileName ?? '').replace(/\.[^.]*$/, '').trim();
  return name || DEFAULT_PROJECT_NAME;
}

export function parseTodoistCsv(text: string, fileName?: string): TodoistParseResult {
  const rows = parseCsv(text);
  const header = rows[0]?.map((c) => c.trim().toUpperCase());
  if (!header || header[0] !== 'TYPE' || header[1] !== 'CONTENT') return { ok: false, error: BAD_FORMAT_ERROR };
  const col = (name: string) => header.indexOf(name);
  const idx = {
    type: 0,
    content: 1,
    description: col('DESCRIPTION'),
    priority: col('PRIORITY'),
    date: col('DATE'),
    duration: col('DURATION'),
    unit: col('DURATION_UNIT'),
    deadline: col('DEADLINE'),
  };
  const projectName = projectNameFromFile(fileName);
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

  const tasks: ImportTask[] = [];
  let section: string | undefined;
  const durationsMin: (number | undefined)[] = [];
  const seen = new Map<string, number>();
  let unrecognizedDates = 0;
  let last: ImportTask | undefined;

  rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    const type = cell(r, idx.type).toLowerCase();
    const content = cell(r, idx.content);
    if (type === 'section') {
      section = content || undefined;
      last = undefined;
      return;
    }
    if (type === 'note') {
      if (last && content) last.notes = last.notes ? `${last.notes}\n${content}` : content;
      return;
    }
    if (type !== 'task' || !content) return;

    const notes: string[] = [];
    const description = cell(r, idx.description);
    if (description) notes.push(description);

    const dateRaw = cell(r, idx.date);
    const deadlineRaw = cell(r, idx.deadline);
    const date = dateRaw ? parseIsoDue(dateRaw) : undefined;
    const due = date ?? (dateRaw ? undefined : parseIsoDue(deadlineRaw));
    if (dateRaw && !date) {
      unrecognizedDates += 1;
      notes.push(`${NOTE_DUE_LABEL}: ${dateRaw}`);
      // Срок со слов не переносим, но дедлайн не теряем.
      if (deadlineRaw) notes.push(`дедлайн из Todoist: ${deadlineRaw}`);
    } else if (!dateRaw && deadlineRaw && !due) {
      unrecognizedDates += 1;
      notes.push(`дедлайн из Todoist: ${deadlineRaw}`);
    }

    const priority = Number(cell(r, idx.priority));
    const minutes = durationMinutes(cell(r, idx.duration), cell(r, idx.unit));
    durationsMin.push(minutes);
    const rounded = minutes === undefined ? undefined : Math.round(minutes);
    const estimateMin = rounded !== undefined && rounded >= 1 && rounded <= 1440 ? rounded : undefined;
    const occurrence = (seen.get(content) ?? 0) + 1;
    seen.set(content, occurrence);

    const task: ImportTask = {
      title: content,
      externalId: todoistExternalId(projectName, content, occurrence),
      projectName,
      row,
      ...(notes.length > 0 && { notes: notes.join('\n') }),
      ...([1, 2, 3, 4].includes(priority) && { priority: priority as 1 | 2 | 3 | 4 }),
      ...(due ?? {}),
      // Контракт `importTasks`: целое 1–1440 — минуты округляем, длительность дольше суток не переносим.
      ...(estimateMin !== undefined && { estimateMin }),
      ...(section && { tags: [section] }),
    };
    tasks.push(task);
    last = task;
  });

  return {
    ok: true,
    preview: {
      project: { name: projectName },
      tasks,
      durationsMin,
      durations: tasks.filter((t) => t.estimateMin !== undefined).length,
      unrecognizedDates,
    },
  };
}
