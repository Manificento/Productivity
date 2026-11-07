import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { fromDateKey } from '../../../core/dates';
import type { DateKey, Note } from '../../../core/types';

export interface NoteFilter {
  query?: string;
  /** Project id, event id or DateKey the note must be linked to. */
  linkId?: string;
}

export function noteTitle(note: Pick<Note, 'title'>): string {
  return note.title.trim() || 'Без названия';
}

/** Case-insensitive search in title and body, optional link filter; most recently edited first. */
export function filterNotes(notes: Note[], { query, linkId }: NoteFilter): Note[] {
  const q = query?.trim().toLocaleLowerCase('ru') ?? '';
  return notes
    .filter((n) => !linkId || n.linkIds.includes(linkId))
    .filter((n) => !q || `${n.title}\n${n.body}`.toLocaleLowerCase('ru').includes(q))
    .sort((x, y) => y.updatedAt - x.updatedAt);
}

export function toggleLink(linkIds: string[], id: string): string[] {
  return linkIds.includes(id) ? linkIds.filter((x) => x !== id) : [...linkIds, id];
}

/** Other notes sharing at least one link (project, event or day) with `note`; most recently edited first. */
export function relatedNotes(notes: Note[], note: Pick<Note, 'id' | 'linkIds'>): Note[] {
  return notes
    .filter((n) => n.id !== note.id && n.linkIds.some((id) => note.linkIds.includes(id)))
    .sort((x, y) => y.updatedAt - x.updatedAt);
}

/** Title of a day page: «4 ноября 2026». */
export function dayTitle(date: DateKey): string {
  return format(fromDateKey(date), 'd MMMM yyyy', { locale: ru });
}
