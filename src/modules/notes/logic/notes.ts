import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { fromDateKey } from '../../../core/dates';
import type { DateKey, LifeEvent, Note, Project } from '../../../core/types';

export interface NoteFilter {
  query?: string;
  /** Project id, event id or DateKey the note must be linked to. */
  linkId?: string;
  /** More ids the note must be linked to as well (all of them, plus `linkId`). */
  linkIds?: string[];
}

export function noteTitle(note: Pick<Note, 'title'>): string {
  return note.title.trim() || 'Без названия';
}

/** Case-insensitive search in title and body, optional link filter; most recently edited first. */
export function filterNotes(notes: Note[], { query, linkId, linkIds = [] }: NoteFilter): Note[] {
  const q = query?.trim().toLocaleLowerCase('ru') ?? '';
  const required = linkId ? [linkId, ...linkIds] : linkIds;
  return notes
    .filter(
      (n) =>
        required.every((id) => n.linkIds.includes(id)) &&
        (!q || `${n.title}\n${n.body}`.toLocaleLowerCase('ru').includes(q)),
    )
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

/** Day in short Russian form: «7 ноя 2026». */
export function formatDay(date: DateKey): string {
  const d = fromDateKey(date);
  const month = format(d, 'MMM', { locale: ru }).replace('.', '').slice(0, 3);
  return `${format(d, 'd')} ${month} ${format(d, 'yyyy')}`;
}

/** Project name for link pickers and cards; archived projects are marked. */
export function projectLabel(p: Pick<Project, 'name' | 'archived'>): string {
  return p.archived ? `${p.name} (в архиве)` : p.name;
}

/** Active projects first, archived ones at the end; order within each group is kept. */
export function projectsForPicker<P extends Pick<Project, 'archived'>>(projects: P[]): P[] {
  return [...projects.filter((p) => !p.archived), ...projects.filter((p) => p.archived)];
}

/** Readable labels of a note's links, in link order; unknown ids are skipped. */
export function linkLabels(
  linkIds: string[],
  { projects, events }: { projects: Project[]; events: Pick<LifeEvent, 'id' | 'title'>[] },
): string[] {
  return linkIds.flatMap((id) => {
    const project = projects.find((p) => p.id === id);
    if (project) return [projectLabel(project)];
    const event = events.find((e) => e.id === id);
    if (event) return [event.title];
    return isDayKey(id) ? [formatDay(id)] : [];
  });
}

export function isDayKey(id: string): id is DateKey {
  return /^\d{4}-\d{2}-\d{2}$/.test(id);
}
